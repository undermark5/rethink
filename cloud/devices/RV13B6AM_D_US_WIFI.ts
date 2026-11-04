import HADevice from './base'
import { Device as Thinq2Device } from '../thinq2/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'
import AABBDevice from './aabb_device'
import { Enum } from '@/util/enum'

// LG DLE3500W electric dryer. Same 0xEB/0xEC framing and record layout as RV13B6ES_D_US_WIFI (see that
// file for the framing). Differences:
//   * courses: adds Small Load and Rack Dry; no Antibacterial course, steam courses or Super Dry
//   * Antibacterial is an option (rec[15] bit 0x80), not a course
//   * no Reduce Static, Turbo Steam or load item count
//   * the initial estimate (rec[4:6]) rises when the moisture sensor extends a course
//   * an extra Wrinkle Care phase after End

// One status block is a leading byte + the 28B record; 0xEB carries one block, 0xEC two (old, current).
const STATUS_LENGTH = 29

// "Report your state", sent on connect so HA isn't left blank until the panel is touched.
const STATUS_REQUEST = 'F0ED1121010000001800'

// Offsets are relative to the record's 0x1b marker (rec[0]).
const PHASE_OFFSET = 1
const TIME_HOUR_OFFSET = 2
const TIME_MIN_OFFSET = 3
const INITIAL_TIME_HOUR_OFFSET = 4
const INITIAL_TIME_MIN_OFFSET = 5
const COURSE_OFFSET = 6
const DRY_LEVEL_OFFSET = 8
const TEMP_OFFSET = 9
const TIME_DRY_SETTING_OFFSET = 10 // 1..5 = 20..60 minutes, per the modelJson's timeDry
const SIGNAL_OFFSET = 11
const MORE_LESS_TIME_OFFSET = 12 // signed minutes added to the course default

// rec[15]: options. The 0x40 bit is set while the panel is awake and is not an option.
const FLAGS_OFFSET = 15
const FLAG_CONTROL_LOCK = 0x01
const FLAG_DAMP_DRY_SIGNAL = 0x08
const FLAG_WRINKLE_CARE = 0x10
const FLAG_ANTIBACTERIAL = 0x80 // only offered on some courses; the course byte is unchanged

// rec[16]: more options
const OPT2_OFFSET = 16
const OPT2_REMOTE_START = 0x01
const OPT2_ENERGY_SAVER = 0x02
const OPT2_ENERGY_SAVER_DEFAULT = 0x80 // Energy Saver as the default for all courses (long press)

const PHASE_OFF = 0x00

// The modelJson's state values; unmapped codes are reported as 'Running'. 0x38 follows End when Wrinkle Care
// is on; rec[4:6] then counts the minutes spent in it, as the cloud does.
const STATUS = Enum.of({
    Off: 0x00,
    Initial: 0x01,
    Running: 0x02,
    Pause: 0x03,
    End: 0x04,
    Error: 0x05,
    'Smart Diagnosis': 0x08,
    Drying: 0x32,
    Cooling: 0x33,
    'Wrinkle Care': 0x38,
})

// The Downloaded Cycle position reports the loaded course's base course: Bedding for Bedding/Curtains,
// 0x0c (cloud "KIDWEAR") for Kids' Clothes.
const COURSE = Enum.of({
    'Heavy Duty': 0x01,
    Towels: 0x02,
    Normal: 0x03,
    'Perm Press': 0x04,
    Delicates: 0x05,
    Bedding: 0x07,
    'Small Load': 0x09,
    "Kids' Clothes": 0x0c,
    'Speed Dry': 0x10,
    'Air Dry': 0x11,
    'Time Dry': 0x12,
    'Rack Dry': 0x13,
})

// 0 is used by courses that don't sense dryness, and reads as unknown
const DRY_LEVEL = Enum.of({
    Damp: 1,
    Less: 2,
    Normal: 3,
    More: 4,
    Very: 5,
})

// The panel only offers Low/Medium/High. 0 (Rack Dry, Air Dry) reads as unknown.
const TEMP = Enum.of({
    Low: 2,
    Medium: 3,
    High: 5,
})

const SIGNAL = Enum.of({
    Off: 0x00,
    Low: 0x01,
    High: 0x04,
})

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq, false)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Dryer' }),
                components: {
                    power: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-power',
                        state_topic: '$this/power',
                        name: 'Power',
                        icon: 'mdi:tumble-dryer',
                        device_class: 'running',
                    },
                    status: {
                        platform: 'sensor',
                        unique_id: '$deviceid-status',
                        state_topic: '$this/status',
                        name: 'Status',
                        icon: 'mdi:state-machine',
                        // free-text, not an enum, because of the 'Running' fallback
                    },
                    course: {
                        platform: 'sensor',
                        unique_id: '$deviceid-course',
                        state_topic: '$this/course',
                        name: 'Course',
                        icon: 'mdi:pin-outline',
                        device_class: 'enum',
                        options: COURSE.options,
                    },
                    remaining_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-remaining_time',
                        state_topic: '$this/remaining_time',
                        name: 'Remaining time',
                        icon: 'mdi:timer-outline',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                    },
                    initial_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-initial_time',
                        state_topic: '$this/initial_time',
                        name: 'Initial time estimate',
                        icon: 'mdi:clock-outline',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                        entity_category: 'diagnostic',
                    },
                    dry_level: {
                        platform: 'sensor',
                        unique_id: '$deviceid-dry_level',
                        state_topic: '$this/dry_level',
                        name: 'Dry level',
                        icon: 'mdi:water-percent',
                        device_class: 'enum',
                        options: DRY_LEVEL.options,
                    },
                    temp: {
                        platform: 'sensor',
                        unique_id: '$deviceid-temp',
                        state_topic: '$this/temp',
                        name: 'Temperature',
                        icon: 'mdi:thermometer',
                        device_class: 'enum',
                        options: TEMP.options,
                    },
                    time_dry_setting: {
                        platform: 'sensor',
                        unique_id: '$deviceid-time_dry_setting',
                        state_topic: '$this/time_dry_setting',
                        name: 'Time Dry setting',
                        icon: 'mdi:timer-cog-outline',
                        unit_of_measurement: 'min',
                        entity_category: 'diagnostic',
                    },
                    more_less_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-more_less_time',
                        state_topic: '$this/more_less_time',
                        name: 'More/Less time',
                        icon: 'mdi:plus-minus-variant',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                        entity_category: 'diagnostic',
                    },
                    remote_start: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-remote_start',
                        state_topic: '$this/remote_start',
                        name: 'Remote start',
                        icon: 'mdi:cellphone-wireless',
                        entity_category: 'diagnostic',
                    },
                    signal: {
                        platform: 'sensor',
                        unique_id: '$deviceid-signal',
                        state_topic: '$this/signal',
                        name: 'Signal',
                        icon: 'mdi:bell-outline',
                        device_class: 'enum',
                        options: SIGNAL.options,
                        entity_category: 'diagnostic',
                    },
                    damp_dry_signal: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-damp_dry_signal',
                        state_topic: '$this/damp_dry_signal',
                        name: 'Damp Dry Signal',
                        icon: 'mdi:water-alert-outline',
                    },
                    child_lock: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-child_lock',
                        state_topic: '$this/child_lock',
                        name: 'Control lock', // the panel's name for it
                        icon: 'mdi:lock',
                        entity_category: 'diagnostic',
                    },
                    energy_saver: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-energy_saver',
                        state_topic: '$this/energy_saver',
                        name: 'Energy Saver',
                        icon: 'mdi:leaf',
                    },
                    energy_saver_default: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-energy_saver_default',
                        state_topic: '$this/energy_saver_default',
                        name: 'Energy Saver default',
                        icon: 'mdi:leaf',
                        entity_category: 'diagnostic',
                    },
                    wrinkle_care: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-wrinkle_care',
                        state_topic: '$this/wrinkle_care',
                        name: 'Wrinkle Care',
                        icon: 'mdi:tshirt-crew-outline',
                    },
                    antibacterial: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-antibacterial',
                        state_topic: '$this/antibacterial',
                        name: 'Antibacterial',
                        icon: 'mdi:bacteria-outline',
                    },
                },
            }),
        )
    }

    start() {
        this.send(Buffer.from(STATUS_REQUEST, 'hex'))
    }

    processAABB(buf: Buffer) {
        this.processCommonStatus(buf, 0x30, STATUS_LENGTH, this.processStatus)
    }

    private processStatus(status: Buffer) {
        const rec = status.subarray(1)
        if (rec[0] !== 0x1b) return

        const phase = rec[PHASE_OFFSET]
        const isOff = phase === PHASE_OFF

        this.publishProperty('power', isOff ? 'OFF' : 'ON')
        this.publishProperty('status', STATUS.map(phase) ?? 'Running')
        this.publishProperty('course', COURSE.map(rec[COURSE_OFFSET]))
        this.publishProperty('remaining_time', isOff ? 0 : rec[TIME_HOUR_OFFSET] * 60 + rec[TIME_MIN_OFFSET])
        this.publishProperty(
            'initial_time',
            isOff ? 0 : rec[INITIAL_TIME_HOUR_OFFSET] * 60 + rec[INITIAL_TIME_MIN_OFFSET],
        )
        this.publishProperty('dry_level', DRY_LEVEL.map(rec[DRY_LEVEL_OFFSET]))
        this.publishProperty('temp', TEMP.map(rec[TEMP_OFFSET]))
        this.publishProperty('signal', SIGNAL.map(rec[SIGNAL_OFFSET]))
        this.publishProperty('more_less_time', isOff ? 0 : rec.readInt8(MORE_LESS_TIME_OFFSET))
        const timeDry = rec[TIME_DRY_SETTING_OFFSET]
        this.publishProperty('time_dry_setting', timeDry >= 1 && timeDry <= 5 ? (timeDry + 1) * 10 : 0)

        const flags = rec[FLAGS_OFFSET]
        this.publishProperty('child_lock', (flags & FLAG_CONTROL_LOCK) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('damp_dry_signal', (flags & FLAG_DAMP_DRY_SIGNAL) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('wrinkle_care', (flags & FLAG_WRINKLE_CARE) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('antibacterial', (flags & FLAG_ANTIBACTERIAL) !== 0 ? 'ON' : 'OFF')
        // bit 0x20 is set by Custom Pgm but also appears without it, so it is left out

        const opt2 = rec[OPT2_OFFSET]
        this.publishProperty('remote_start', (opt2 & OPT2_REMOTE_START) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('energy_saver', (opt2 & OPT2_ENERGY_SAVER) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('energy_saver_default', (opt2 & OPT2_ENERGY_SAVER_DEFAULT) !== 0 ? 'ON' : 'OFF')
    }
}
