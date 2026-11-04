import HADevice from './base'
import { Device as Thinq2Device } from '../thinq2/device'
import { type Connection } from '../homeassistant'
import { type Metadata } from '../thinq'
import { allowExtendedType } from '@/util/casting'
import AABBDevice from './aabb_device'
import { Enum } from '@/util/enum'

// LG WM3500CW front-load washer — matched on modelId "VIC2_799_US_FACTORY" (thinq2 deviceType 201). Same AABB
// record layout as F3L2CYU__ and F3L7CYK5W_US_WIFI (a leading byte + a 25-byte record led by a 0x18
// marker) but NOT an alias of either:
//   * The course codes are its own: they run 1-10 in dial order, and neither sibling's table fits.
//   * The soil, spin and temperature panels offer a different set of steps (no in-between soil levels,
//     a single High spin coded 5, Semi-Warm but no Extra Hot), so the value tables differ too.
//   * rec[16] carries Fresh Care, and rec[7] carries the error code. Neither sibling decodes either.
//
// Frames are discriminated by buf[1] (buf[0] == 0x20 on every frame):
//   0xEC        status frame — two stacked blocks (old state, then current); we read the current one.
//   0xEB        single-block status frame, sent in reply to the status request and at reconnect.
//   0xE2        NOT decoded, deliberately. As on F3L7CYK5W it carries a valid 0x18 record, but it is sent
//               right after a cycle ends and replays that cycle's START (phase Sensing, the pre-run
//               estimate, the tub-clean count before it was incremented).
//   0xBD / 0xCD large status dumps (on every phase change / about every 5 minutes) — not decoded.
//   0xDC        Smart Diagnosis data, sent in reply to the cloud's 0xF023 request — not decoded.
//   0x31        device-ID/serial frame at connect — not decoded.
//   0x72        short events: 00 c9 00 when the door locks, 00 c8 00 when it unlocks. The same
//               information is in rec[16], so they are not decoded.
//   0xD8        heartbeat — not decoded.
//
// Every offset and table entry below was confirmed on the appliance by changing one thing at a time at
// the control panel and matching the byte that moved against what the panel displayed: a sweep of every
// dial position, every button stepped through each of its values, and a complete Whites cycle including
// Add Garments, Pause, a door-open start attempt, and a remote pause/resume from the LG app.

// One status block is a leading byte + the 25B record; 0xEB carries one block, 0xEC two (old, current).
const STATUS_LENGTH = 26

// Status query, sent on connect. These are the exact bytes LG's own cloud sent this washer when it
// reconnected; the washer answered with a 0xEB snapshot. 0xF0ED only ever reads.
const STATUS_REQUEST = 'F0ED112101000000180413140000'

const RECORD_MARKER = 0x18

// Offsets below are relative to the record's own 0x18 marker (rec[0]).
const PHASE_OFFSET = 1
// rec[2:4] = [hour][minute], the live countdown. Matched the panel display at every dial position that
// shows a time (1:00 Bedding, 0:41 Delicates, 0:15 Speed Wash, 0:08 Rinse+Spin).
const TIME_HOUR_OFFSET = 2
const TIME_MIN_OFFSET = 3
// rec[4:6] = [hour][minute], the cycle's total estimate. Tracks rec[2:4] while idle; once Sensing has
// revised the estimate it pins (1:12 -> 1:08 here) while rec[2:4] counts down.
const INITIAL_TIME_HOUR_OFFSET = 4
const INITIAL_TIME_MIN_OFFSET = 5
const COURSE_OFFSET = 6
// rec[7]: error code. 0 throughout normal use; pressing Start with the door open read 0x11 while the
// panel flashed dE1, and the next Start press cleared it.
const ERROR_OFFSET = 7
// rec[8] drops to 0 once rinsing starts and rec[10] once spinning starts; both report as unknown then.
const SOIL_OFFSET = 8
const SPIN_OFFSET = 9
const TEMP_OFFSET = 10
// rec[11] packs two fields, as on F3L7CYK5W:
//   low nibble  = rinses remaining. The course's own count (2 on most courses, 3 on Whites and Towels,
//                 1 on Speed Wash and Rinse+Spin), counting down as each rinse completes.
//   high nibble = the Extra Rinse setting, stepped 1 -> 2 -> 3 -> off at the panel.
const RINSE_OFFSET = 11
// rec[13:15] = [hour][minute], the Delay Wash reserve time. Stepped 1-19 hours one press at a time,
// plain binary; the minute byte never moved.
const RESERVE_HOUR_OFFSET = 13
const RESERVE_MIN_OFFSET = 14

// rec[15]: options bitfield; each bit isolated with a single press, nothing else in the record moving.
const FLAGS_OFFSET = 15
const FLAG_CONTROL_LOCK = 0x01
const FLAG_DELAY_ACTIVE = 0x02
const FLAG_PRE_WASH = 0x08
const FLAG_RINSE_SPIN = 0x20
const FLAG_EXTRA_RINSE = 0x40
// Bit 0x04 (Steam on F3L7CYK5W) appeared only with the Tub Clean course selected. This panel has no
// Steam button to confirm it with, so it is not published.

const OPT2_OFFSET = 16
const OPT2_FRESH_CARE = 0x01
const OPT2_COLD_WASH = 0x10
// Door lock: set at the start of every cycle and on resume, cleared on Pause/Add Garments and when the
// cycle ends. Arming Remote Start also sets it while the machine is idle — remote start has no bit of
// its own. A pause sent from the LG app leaves the door locked.
const OPT2_DOOR_LOCKED = 0x80

// rec[17]: 0x02 tracks the door latch and lags the lock bit by a few seconds; 0x10 is set by Add Garments
// (but not by a plain Pause). The door's open/closed position is not reported at all — opening and
// closing it produced no frame — so nothing from rec[17] is published.

// rec[19] is a counter that moves in both idle and running states without a matching panel change;
// rec[20] is the previous phase; rec[23] is the active downloaded course while the dial is on
// Downloaded. None of them are published.

// rec[22]: washes since the last Tub Clean. Matches the 0xD8 heartbeat's own copy, and went 56 -> 57 at
// the end of the captured cycle.
const TCL_COUNT_OFFSET = 22
// rec[24]: load level, latched when Sensing hands over to Washing (3 for the single towel of the captured
// cycle) and kept through the end of the cycle. While idle it holds values that follow the selected
// course instead, so it is only published once a cycle has measured it.
const LOAD_LEVEL_OFFSET = 24

const PHASE_OFF = 0
const PHASE_STANDBY = 5
const PHASE_END = 60
const PHASE_REFRESHING = 61

// Only phases this appliance was seen in. The codes match F3L7CYK5W's list. End (60) was not reached by
// the captured cycle (Fresh Care took over from Spinning), but it is what the record carried as the
// previous phase when the washer powered on after its last ordinary wash.
const STATUS = Enum.of({
    Off: PHASE_OFF,
    Standby: PHASE_STANDBY,
    Paused: 6,
    Detecting: 20,
    // The washer passes through this on its way to Paused when Add Garments is pressed. With a near-empty
    // tub it lasted about a second; it presumably lasts as long as the water takes to drop below the door.
    'Add Garments': 21,
    Washing: 23,
    Rinsing: 30,
    Spinning: 40,
    End: PHASE_END,
    'Fresh Care': PHASE_REFRESHING,
})

// Course codes count up in dial order. 0xFE is what the washer reports at power-off (no selection).
const COURSE = Enum.of({
    'Tub Clean': 0x01,
    Whites: 0x02,
    Bedding: 0x03,
    'Heavy Duty': 0x04,
    Normal: 0x05,
    'Perm Press': 0x06,
    Delicates: 0x07,
    Towels: 0x08,
    'Speed Wash': 0x09,
    Downloaded: 0x0a,
})

// Each table is every step the panel button offers. The codes skip the steps this model lacks.
const SOIL = Enum.of({
    Light: 1,
    Normal: 3,
    Heavy: 5,
})

const SPIN = Enum.of({
    'No Spin': 1,
    Low: 2,
    Medium: 3,
    High: 5,
})

const TEMP = Enum.of({
    'Tap Cold': 1,
    Cold: 2,
    'Semi-Warm': 3,
    Warm: 4,
    Hot: 6,
})

// Only the code that was produced on the appliance. Any other nonzero code still sets the `error`
// problem sensor; its name just reports as unknown.
const ERROR = Enum.of({
    dE1: 0x11,
})

export default class Device extends AABBDevice {
    constructor(HA: Connection, thinq: Thinq2Device, meta: Metadata) {
        super(HA, thinq, false)
        this.setConfig(
            allowExtendedType({
                ...HADevice.config(meta, { name: 'LG Washer' }),
                components: {
                    power: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-power',
                        state_topic: '$this/power',
                        name: 'Power',
                        icon: 'mdi:washing-machine',
                        device_class: 'running',
                    },
                    status: {
                        platform: 'sensor',
                        unique_id: '$deviceid-status',
                        state_topic: '$this/status',
                        name: 'Status',
                        icon: 'mdi:state-machine',
                        device_class: 'enum',
                        options: STATUS.options,
                    },
                    course: {
                        platform: 'sensor',
                        unique_id: '$deviceid-course',
                        state_topic: '$this/course',
                        name: 'Course',
                        icon: 'mdi:pin-outline',
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
                        name: 'Initial time',
                        icon: 'mdi:timer-sand',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                    },
                    reserve_time: {
                        platform: 'sensor',
                        unique_id: '$deviceid-reserve_time',
                        state_topic: '$this/reserve_time',
                        name: 'Delay Wash time remaining',
                        icon: 'mdi:clock-outline',
                        device_class: 'duration',
                        unit_of_measurement: 'min',
                    },
                    soil: {
                        platform: 'sensor',
                        unique_id: '$deviceid-soil',
                        state_topic: '$this/soil',
                        name: 'Soil level',
                        icon: 'mdi:liquid-spot',
                    },
                    spin: {
                        platform: 'sensor',
                        unique_id: '$deviceid-spin',
                        state_topic: '$this/spin',
                        name: 'Spin',
                        icon: 'mdi:autorenew',
                    },
                    temp: {
                        platform: 'sensor',
                        unique_id: '$deviceid-temp',
                        state_topic: '$this/temp',
                        name: 'Temperature',
                        icon: 'mdi:thermometer',
                    },
                    rinse_count: {
                        platform: 'sensor',
                        unique_id: '$deviceid-rinse_count',
                        state_topic: '$this/rinse_count',
                        name: 'Rinses remaining',
                        icon: 'mdi:water-sync',
                        state_class: 'measurement',
                    },
                    extra_rinse: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-extra_rinse',
                        state_topic: '$this/extra_rinse',
                        name: 'Extra rinse',
                        icon: 'mdi:water-plus',
                    },
                    extra_rinse_count: {
                        platform: 'sensor',
                        unique_id: '$deviceid-extra_rinse_count',
                        state_topic: '$this/extra_rinse_count',
                        name: 'Extra rinse count',
                        icon: 'mdi:water-plus',
                        state_class: 'measurement',
                    },
                    pre_wash: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-pre_wash',
                        state_topic: '$this/pre_wash',
                        name: 'Pre-wash',
                        icon: 'mdi:water-sync',
                    },
                    cold_wash: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-cold_wash',
                        state_topic: '$this/cold_wash',
                        name: 'Cold wash',
                        icon: 'mdi:snowflake',
                    },
                    fresh_care: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-fresh_care',
                        state_topic: '$this/fresh_care',
                        name: 'Fresh Care',
                        icon: 'mdi:fan',
                    },
                    rinse_spin: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-rinse_spin',
                        state_topic: '$this/rinse_spin',
                        name: 'Rinse + Spin',
                        icon: 'mdi:water-sync',
                    },
                    delay_wash: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-delay_wash',
                        state_topic: '$this/delay_wash',
                        name: 'Delay Wash',
                        icon: 'mdi:clock-plus-outline',
                    },
                    child_lock: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-child_lock',
                        state_topic: '$this/child_lock',
                        name: 'Control lock',
                        icon: 'mdi:lock-outline',
                    },
                    door_lock: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-door_lock',
                        state_topic: '$this/door_lock',
                        name: 'Door lock',
                        icon: 'mdi:lock', // NOT device_class 'lock' — that class is inverted (on = unlocked)
                        entity_category: 'diagnostic',
                    },
                    error: {
                        platform: 'binary_sensor',
                        unique_id: '$deviceid-error',
                        state_topic: '$this/error',
                        name: 'Error',
                        device_class: 'problem',
                    },
                    error_code: {
                        platform: 'sensor',
                        unique_id: '$deviceid-error_code',
                        state_topic: '$this/error_code',
                        name: 'Error code',
                        icon: 'mdi:alert-circle-outline',
                    },
                    load_level: {
                        platform: 'sensor',
                        unique_id: '$deviceid-load_level',
                        state_topic: '$this/load_level',
                        name: 'Load level',
                        icon: 'mdi:weight',
                        state_class: 'measurement',
                        entity_category: 'diagnostic',
                    },
                    tub_clean_count: {
                        platform: 'sensor',
                        unique_id: '$deviceid-tub_clean_count',
                        state_topic: '$this/tub_clean_count',
                        name: 'Washes since Tub Clean',
                        icon: 'mdi:counter',
                        entity_category: 'diagnostic',
                    },
                },
            }),
        )
    }

    // The washer only volunteers a status frame when something changes, so without asking, Home
    // Assistant would stay blank after every reconnect until someone touched the panel.
    start() {
        this.send(Buffer.from(STATUS_REQUEST, 'hex'))
    }

    processAABB(buf: Buffer) {
        this.processCommonStatus(buf, 0x20, STATUS_LENGTH, this.processStatus)
        // 0xE2 is intentionally NOT handled here — see the header note; it is a post-cycle replay.
    }

    private processStatus(status: Buffer) {
        const rec = status.subarray(1)
        if (rec[0] !== RECORD_MARKER) return

        const phase = rec[PHASE_OFFSET]
        const isOff = phase === PHASE_OFF
        // No cycle in flight: the time bytes park on a stale minute at Off and once the cycle is over,
        // and a finished washer should not advertise "1 minute remaining".
        const finished = phase === PHASE_END || phase === PHASE_REFRESHING
        const idle = isOff || finished
        const inCycle = !isOff && phase !== PHASE_STANDBY

        this.publishProperty('power', isOff ? 'OFF' : 'ON')
        this.publishProperty('status', STATUS.map(phase))
        this.publishProperty('course', COURSE.map(rec[COURSE_OFFSET]))
        this.publishProperty('remaining_time', idle ? 0 : rec[TIME_HOUR_OFFSET] * 60 + rec[TIME_MIN_OFFSET])
        this.publishProperty(
            'initial_time',
            idle ? 0 : rec[INITIAL_TIME_HOUR_OFFSET] * 60 + rec[INITIAL_TIME_MIN_OFFSET],
        )
        this.publishProperty('reserve_time', isOff ? 0 : rec[RESERVE_HOUR_OFFSET] * 60 + rec[RESERVE_MIN_OFFSET])
        this.publishProperty('soil', SOIL.map(rec[SOIL_OFFSET]))
        this.publishProperty('spin', SPIN.map(rec[SPIN_OFFSET]))
        this.publishProperty('temp', TEMP.map(rec[TEMP_OFFSET]))

        this.publishProperty('rinse_count', rec[RINSE_OFFSET] & 0x0f)
        this.publishProperty('extra_rinse_count', rec[RINSE_OFFSET] >> 4)

        const flags = rec[FLAGS_OFFSET]
        this.publishProperty('child_lock', (flags & FLAG_CONTROL_LOCK) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('delay_wash', (flags & FLAG_DELAY_ACTIVE) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('pre_wash', (flags & FLAG_PRE_WASH) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('rinse_spin', (flags & FLAG_RINSE_SPIN) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('extra_rinse', (flags & FLAG_EXTRA_RINSE) !== 0 ? 'ON' : 'OFF')

        const opt2 = rec[OPT2_OFFSET]
        this.publishProperty('fresh_care', (opt2 & OPT2_FRESH_CARE) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('cold_wash', (opt2 & OPT2_COLD_WASH) !== 0 ? 'ON' : 'OFF')
        this.publishProperty('door_lock', (opt2 & OPT2_DOOR_LOCKED) !== 0 ? 'ON' : 'OFF')

        const error = rec[ERROR_OFFSET]
        this.publishProperty('error', error !== 0 ? 'ON' : 'OFF')
        this.publishProperty('error_code', error !== 0 ? ERROR.map(error) : undefined)

        // 0 until Sensing has measured the load, and an unrelated value while idle
        const load = rec[LOAD_LEVEL_OFFSET]
        this.publishProperty('load_level', inCycle && load !== 0 ? load : undefined)
        this.publishProperty('tub_clean_count', rec[TCL_COUNT_OFFSET])

        // Not published, because this appliance does not report them:
        //   * the Signal (chime) setting — changing it produced no frame, and it is absent from 0xCD
        //   * door open/closed — see rec[17] above
        //   * Remote Start — it only shows up as the door lock bit while idle
    }
}
