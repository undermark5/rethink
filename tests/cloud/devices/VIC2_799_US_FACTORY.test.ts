import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/VIC2_799_US_FACTORY'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device, buf } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-id'
const MODEL_ID = 'VIC2_799_US_FACTORY'
const META: Metadata = { modelId: MODEL_ID, modelName: MODEL_ID, swVersion: '0.0.0' }

// All fixtures are REAL frames captured from the physical washer while it was operated at the panel, one
// change at a time. The comments give what the panel displayed for each.

// --- power-on: the old record is the state before power-on, whose previous phase is End (0x3c)
const POWER_ON = buf(
    'aa3a20ec00180000010000fe000000000000000000000000823c40380000001805000000000000000000000000000000000000004038000087bb',
)

// --- dial sweep, in the order the dial was turned
const DIAL_NORMAL = buf(
    'aa3a20ec0018050000000000000000000000000000000000000040380000001805010f010f0500030504020000000000000000004038000018bb',
)
const DIAL_HEAVY_DUTY = buf(
    'aa3a20ec001805010f010f050003050402000000000000000000403800000018050215021504000505040200000000000000000040380000dabb',
)
const DIAL_BEDDING = buf(
    'aa3a20ec0018050215021504000505040200000000000000000040380000001805010001000300030304020000000000000000004038000721bb',
)
const DIAL_WHITES = buf(
    'aa3a20ec0018050100010003000303040200000000000000000040380007001805010c010c020003050603000000000000000000403800000abb',
)
const DIAL_TUB_CLEAN = buf(
    'aa3a20ec001805010c010c02000305060300000000000000000040380000001805011d011d01000003000200000004000000010040380000dbbb',
)
const DIAL_DOWNLOADED = buf(
    'aa3a20ec001805011d011d01000003000200000004000000010040380000001805000f000f0a000105060100000000000000010040380c07ffbb',
)
const DIAL_SPEED_WASH = buf(
    'aa3a20ec001805000f000f0a000105060100000000000000010040380c07001805000f000f09000105060100000000000000010040380007cabb',
)
const DIAL_TOWELS = buf(
    'aa3a20ec001805000f000f09000105060100000000000000010040380007001805010101010800030504030000000000000001004038000027bb',
)
const DIAL_DELICATES = buf(
    'aa3a20ec00180501010101080003050403000000000000000100403800000018050029002907000303020200000000000000010040380007f4bb',
)
const DIAL_PERM_PRESS = buf(
    'aa3a20ec0018050029002907000303020200000000000000010040380007001805003b003b060003030402000000000000000200403800005abb',
)

// --- panel buttons, each stepped from the previous frame's state
const SPIN_HIGH = buf(
    'aa3a20ec001805003b003b06000303040200000000000000020040380000001805003b003b0600030504020000000000000002004038000065bb',
)
const SPIN_OFF = buf(
    'aa3a20ec001805003b003b0600030504020000000000000002004038000000180500300030060003010402000000000000000200403800004dbb',
)
const SPIN_LOW = buf(
    'aa3a20ec0018050030003006000301040200000000000000020040380000001805003b003b0600030204020000000000000002004038000040bb',
)
const SOIL_LIGHT = buf(
    'aa3a20ec0018050100010006000501040200000000000000020040380000001805002a002a06000101040200000000000000020040380000c1bb',
)
const TEMP_TAP_COLD = buf(
    'aa3a20ec0018050100010006000501060200000000000000020040380000001805010001000600050101020000000000000002004038000010bb',
)
const TEMP_SEMI_WARM = buf(
    'aa3a20ec0018050100010006000501020200000000000000020040380000001805010001000600050103020000000000000002004038000016bb',
)
const COLD_WASH_ON = buf(
    'aa3a20ec00180501000100060005010402000000000000000200403800000018050035003506000301020200000000100000030040380000eebb',
)
const EXTRA_RINSE_3 = buf(
    'aa3a20ec001805010c010c06000301042200000040000000030040380000001805011801180600030104320000004000000003004038000009bb',
)
const RINSE_SPIN_ON = buf(
    'aa3a20ec001805003000300600030104020000000000000003004038000000180500080008060000010001000000200000000300403800079abb',
)
const CONTROL_LOCK_ON = buf(
    'aa3a20ec001805003b003b06000303040200000000000000030040380000001805003b003b0600030304020000000100000003004038000064bb',
)
const FRESH_CARE_ON = buf(
    'aa3a20ec001805003b003b06000303040200000000000000030040380000001805003b003b0600030304020000000001000003004038000064bb',
)
const PRE_WASH_ON = buf(
    'aa3a20ec001805003b003b06000303040200000000000000040040380000001805010e010e06000303040200000008000000040040380000b7bb',
)
const DELAY_19H = buf(
    'aa3a20ec001805003b003b06000303040200120002000000040040380000001805003b003b060003030402001300020000000400403800000ebb',
)

// --- a Whites cycle, in order
const SENSING = buf(
    'aa3a20ec001805010c010c02000305060300000000000000050040380000001814010c010c0200030506030000000080000005054038000047bb',
)
const ADD_GARMENTS = buf(
    'aa3a20ec001814010c010c02000305060300000000800200000540380000001815010c010c0200030506030000000000120000144038000015bb',
)
const ADD_GARMENTS_PAUSED = buf(
    'aa3a20ec001815010c010c02000305060300000000001200001440380000001806010c010c0200030506030000000000120000154038000087bb',
)
// Start pressed with the door open: the panel flashed dE1
const DOOR_OPEN_ERROR = buf(
    'aa3a20ec001806010c010c02000305060300000000000000001540380000001805010c010c02110305060300000000000000000640380000f4bb',
)
// the next Start press cleared dE1 and returned to the paused cycle
const ERROR_CLEARED = buf(
    'aa3a20ec001805010c010c02110305060300000000000000000640380000001806010c010c02000305060300000000000000000540380000c4bb',
)
const WASHING_START = buf(
    'aa3a20ec001814010c010c020003050603000000008002000006403800000018170108010802000305060300000000800200011440380003fabb',
)
const WASHING_LATER = buf(
    'aa3a20ec00181701030108020003050603000000008002000314403800030018170102010802000305060300000000800200041440380003e3bb',
)
const PAUSE_AT_PANEL = buf(
    'aa3a20ec001817010101080200030506030000000080020006144038000300180601010108020003050603000000000002000617403800037fbb',
)
const RINSING = buf(
    'aa3a20ec001817003101080200030506030000000080020018064038000300181e00300108020000050603000000008002001a174038000361bb',
)
// paused from the LG app: unlike a pause at the panel, the door stays locked
const PAUSE_FROM_APP = buf(
    'aa3a20ec00181e001e0108020000050602000000008002003b1740380003001806001e0108020000050602000000008002003b1e4038000300bb',
)
// resumed from the LG app, with Fresh Care turned on in the app while paused
const RESUME_WITH_FRESH_CARE = buf(
    'aa3a20ec001806001e0108020000050602000000008002003b1e4038000300181e001e0108020000050602000000008102003b064038000310bb',
)
const SPINNING = buf(
    'aa3a20ec00181e000d010802000005060100000000810200580640380003001828000c010802000005000000000000810200591e4038000322bb',
)
const FRESH_CARE_RUNNING = buf(
    'aa3a20ec0018280001010802000000000000000000010200851e4039000300183d0001010802000000000000000000010200852840390003bebb',
)
// sent right after spinning ended: replays the cycle's start
const E2_STALE_REPLAY = buf('aa2020e2031814010c010c02000305060300000000800000850540380000ffbb')
const POWER_OFF = buf(
    'aa3a20ec00183d000101080200000000000000000001020085284039000300180000010000fe000000000000000000000000863d4039000085bb',
)
const EB_OFF = buf('aa2020eb00180000010000fe000000000000000000000000873d403900007cbb')

function makeDevice() {
    const ha = new MockHAConnection()
    const thinq = new MockThinq2Device(DEVICE_ID, META)
    const dev = new DUT(ha.asConnection(), thinq, META)
    return { ha, thinq, dev }
}

function feed(frames: Buffer[]) {
    const { ha, thinq } = makeDevice()
    for (const f of frames) thinq.emit('data', f)
    return ha.devices[DEVICE_ID].properties
}

describe('VIC2_799_US_FACTORY', () => {
    test('powering on reports Standby with nothing selected yet', () => {
        const p = feed([POWER_ON])
        assert.equal(p.power, 'ON')
        assert.equal(p.status, 'Standby')
        assert.equal(p.tub_clean_count, 56)
    })

    // The test that fails if this model is aliased to F3L7CYK5W_US_WIFI, whose table calls 0x05
    // Heavy Duty and 0x0a Towels.
    test('every dial position decodes with this model’s own course table', () => {
        assert.equal(feed([DIAL_NORMAL]).course, 'Normal')
        assert.equal(feed([DIAL_HEAVY_DUTY]).course, 'Heavy Duty')
        assert.equal(feed([DIAL_BEDDING]).course, 'Bedding')
        assert.equal(feed([DIAL_WHITES]).course, 'Whites')
        assert.equal(feed([DIAL_TUB_CLEAN]).course, 'Tub Clean')
        assert.equal(feed([DIAL_DOWNLOADED]).course, 'Downloaded')
        assert.equal(feed([DIAL_SPEED_WASH]).course, 'Speed Wash')
        assert.equal(feed([DIAL_TOWELS]).course, 'Towels')
        assert.equal(feed([DIAL_DELICATES]).course, 'Delicates')
        assert.equal(feed([DIAL_PERM_PRESS]).course, 'Perm Press')
    })

    test('each course reports the settings and time the panel showed', () => {
        const bedding = feed([DIAL_BEDDING])
        assert.equal(bedding.temp, 'Warm')
        assert.equal(bedding.spin, 'Medium')
        assert.equal(bedding.soil, 'Normal')
        assert.equal(bedding.remaining_time, 60) // panel: 1:00

        const delicates = feed([DIAL_DELICATES])
        assert.equal(delicates.temp, 'Cold')
        assert.equal(delicates.spin, 'Medium')
        assert.equal(delicates.remaining_time, 41) // panel: 41

        const speed = feed([DIAL_SPEED_WASH])
        assert.equal(speed.temp, 'Hot')
        assert.equal(speed.spin, 'High') // coded 5 here; F3L7CYK5W's 5 is Extra High
        assert.equal(speed.soil, 'Light')
        assert.equal(speed.remaining_time, 15) // panel: 15

        const tubClean = feed([DIAL_TUB_CLEAN])
        assert.equal(tubClean.temp, 'None') // panel shows no temperature or soil for Tub Clean
        assert.equal(tubClean.soil, 'None')
    })

    test('spin, soil and temperature tables skip the steps this panel lacks', () => {
        assert.equal(feed([SPIN_HIGH]).spin, 'High')
        assert.equal(feed([SPIN_OFF]).spin, 'No Spin')
        assert.equal(feed([SPIN_LOW]).spin, 'Low')
        assert.equal(feed([DIAL_HEAVY_DUTY]).soil, 'Heavy')
        assert.equal(feed([SOIL_LIGHT]).soil, 'Light')
        assert.equal(feed([TEMP_TAP_COLD]).temp, 'Tap Cold')
        assert.equal(feed([TEMP_SEMI_WARM]).temp, 'Semi-Warm')
    })

    test('rec[11] packs the course rinses and the Extra Rinse setting', () => {
        const whites = feed([DIAL_WHITES])
        assert.equal(whites.rinse_count, 3)
        assert.equal(whites.extra_rinse_count, 0)
        assert.equal(whites.extra_rinse, 'OFF')

        const extra = feed([EXTRA_RINSE_3])
        assert.equal(extra.extra_rinse, 'ON')
        assert.equal(extra.extra_rinse_count, 3)
        assert.equal(extra.rinse_count, 2)
        assert.equal(extra.remaining_time, 84) // +12 minutes per extra rinse over the 0:48 base
    })

    test('each option bit isolates cleanly', () => {
        const lock = feed([CONTROL_LOCK_ON])
        assert.equal(lock.child_lock, 'ON')
        assert.equal(lock.fresh_care, 'OFF')
        assert.equal(lock.pre_wash, 'OFF')

        const fresh = feed([FRESH_CARE_ON])
        assert.equal(fresh.fresh_care, 'ON')
        assert.equal(fresh.child_lock, 'OFF')

        assert.equal(feed([PRE_WASH_ON]).pre_wash, 'ON')

        const cold = feed([COLD_WASH_ON])
        assert.equal(cold.cold_wash, 'ON')
        assert.equal(cold.temp, 'Cold') // Cold Wash forces the temperature

        const rs = feed([RINSE_SPIN_ON])
        assert.equal(rs.rinse_spin, 'ON')
        assert.equal(rs.remaining_time, 8) // panel: 8
        assert.equal(rs.soil, 'None')
        assert.equal(rs.temp, 'None')
    })

    test('Delay Wash exposes its reserve clock', () => {
        const p = feed([DELAY_19H])
        assert.equal(p.delay_wash, 'ON')
        assert.equal(p.reserve_time, 19 * 60)
    })

    test('starting a cycle locks the door and Sensing revises the estimate', () => {
        const sensing = feed([SENSING])
        assert.equal(sensing.status, 'Detecting')
        assert.equal(sensing.door_lock, 'ON')
        assert.equal(sensing.load_level, 'None') // not measured yet

        const washing = feed([SENSING, WASHING_START])
        assert.equal(washing.status, 'Washing')
        assert.equal(washing.remaining_time, 68) // 1:12 revised to 1:08
        assert.equal(washing.initial_time, 68)
        assert.equal(washing.load_level, 3)

        const later = feed([SENSING, WASHING_START, WASHING_LATER])
        assert.equal(later.remaining_time, 62)
        assert.equal(later.initial_time, 68) // pinned while the countdown runs
    })

    test('Add Garments passes through its own phase, unlocks the door, then pauses', () => {
        const adding = feed([SENSING, ADD_GARMENTS])
        assert.equal(adding.status, 'Add Garments')
        assert.equal(adding.door_lock, 'OFF')

        const paused = feed([SENSING, ADD_GARMENTS, ADD_GARMENTS_PAUSED])
        assert.equal(paused.status, 'Paused')
        assert.equal(paused.door_lock, 'OFF')
    })

    test('a pause at the panel unlocks the door; a pause from the app does not', () => {
        const panel = feed([WASHING_LATER, PAUSE_AT_PANEL])
        assert.equal(panel.status, 'Paused')
        assert.equal(panel.door_lock, 'OFF')

        const app = feed([RINSING, PAUSE_FROM_APP])
        assert.equal(app.status, 'Paused')
        assert.equal(app.door_lock, 'ON')
    })

    test('a door-open start raises dE1, and the next Start clears it', () => {
        const err = feed([ADD_GARMENTS_PAUSED, DOOR_OPEN_ERROR])
        assert.equal(err.error, 'ON')
        assert.equal(err.error_code, 'dE1')

        const cleared = feed([ADD_GARMENTS_PAUSED, DOOR_OPEN_ERROR, ERROR_CLEARED])
        assert.equal(cleared.error, 'OFF')
        assert.equal(cleared.error_code, 'None')
        assert.equal(cleared.status, 'Paused')
    })

    test('a real run: Washing -> Rinsing -> Spinning, settings drop out as they stop applying', () => {
        const rinsing = feed([WASHING_START, RINSING])
        assert.equal(rinsing.status, 'Rinsing')
        assert.equal(rinsing.soil, 'None')
        assert.equal(rinsing.temp, 'Hot')

        const resumed = feed([WASHING_START, RINSING, PAUSE_FROM_APP, RESUME_WITH_FRESH_CARE])
        assert.equal(resumed.status, 'Rinsing')
        assert.equal(resumed.fresh_care, 'ON')
        assert.equal(resumed.rinse_count, 2)

        const spinning = feed([WASHING_START, RINSING, SPINNING])
        assert.equal(spinning.status, 'Spinning')
        assert.equal(spinning.temp, 'None')
        assert.equal(spinning.remaining_time, 12)
    })

    test('Fresh Care follows Spinning: door unlocks, tub-clean count increments, timers zero', () => {
        const p = feed([SPINNING, FRESH_CARE_RUNNING])
        assert.equal(p.status, 'Fresh Care')
        assert.equal(p.power, 'ON')
        assert.equal(p.door_lock, 'OFF')
        assert.equal(p.tub_clean_count, 57) // was 56 before the cycle
        assert.equal(p.load_level, 3)
        assert.equal(p.remaining_time, 0) // the raw bytes park on a stale minute
        assert.equal(p.initial_time, 0)
    })

    test('0xE2 post-cycle replay frames are ignored', () => {
        const p = feed([SPINNING, FRESH_CARE_RUNNING, E2_STALE_REPLAY])
        assert.equal(p.status, 'Fresh Care') // not dragged back to Detecting
        assert.equal(p.tub_clean_count, 57) // not rolled back to 56
        assert.equal(p.remaining_time, 0)
    })

    test('powering off clears the selection; 0xEB decodes the same way', () => {
        for (const frames of [[FRESH_CARE_RUNNING, POWER_OFF], [EB_OFF]]) {
            const p = feed(frames)
            assert.equal(p.status, 'Off')
            assert.equal(p.power, 'OFF')
            assert.equal(p.course, 'None') // 0xFE
            assert.equal(p.remaining_time, 0)
            assert.equal(p.load_level, 'None')
            assert.equal(p.tub_clean_count, 57)
        }
    })

    test('start() sends the status request LG’s cloud sends this washer', () => {
        const { thinq, dev } = makeDevice()
        dev.start()
        assert.deepEqual(
            thinq.outbox.map((b) => b.toString('hex')),
            ['aa12f0ed1121010000001804131400005abb'], // captured from the cloud, answered with 0xEB
        )
    })

    test('frames that are not status frames publish nothing', () => {
        // heartbeat, door-lock event, command ack, truncated status
        for (const junk of ['aa0720d839b7bb', 'aa09207200c9005bbb', 'aa0820002600adbb', 'aa0a20ec001805010cbb']) {
            const { ha, thinq } = makeDevice()
            thinq.emit('data', buf(junk))
            assert.deepEqual(ha.devices[DEVICE_ID].properties, {}, `frame ${junk} should publish nothing`)
        }
    })
})
