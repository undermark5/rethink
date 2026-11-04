import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import DUT from '@/cloud/devices/RV13B6AM_D_US_WIFI'
import type { Metadata } from '@/cloud/thinq'
import { MockHAConnection, MockThinq2Device, buf } from '@/tests/helpers/mocks'

const DEVICE_ID = 'test-id'
const MODEL_ID = 'RV13B6AM_D_US_WIFI'
const META: Metadata = { modelId: MODEL_ID, modelName: MODEL_ID, swVersion: '0.0.0' }

// All fixtures are real captured 0xEC frames. The first group each change one setting on the panel.

// Normal at its defaults (0:57), Energy Saver default on.
const NORMAL_DEFAULT = buf(
    'aa4030ec001b010029002903000303000400000040280000000000000073000000001b010039003903000303000400000040aa000000000000007300000001bb',
)
// Energy Saver default turned off: 0:57 -> 0:41.
const ENERGY_SAVER_DEFAULT_OFF = buf(
    'aa4030ec001b010039003903000303000400000040aa0000000000000073000000001b01002900290300030300040000004028000000000000007300000001bb',
)
const SMALL_LOAD = buf(
    'aa4030ec001b010037003702000303000400000040a80000000000000073000000001b01001e001e09000305000400000040a80000000000000073000000eabb',
)
// Downloaded Cycle with Bedding/Curtains loaded.
const DOWNLOADED = buf(
    'aa4030ec001b01001e001e09000305000400000040a80000000000000073000000001b010105010507000503000400000040a8000000007300007300000082bb',
)
// Rack Dry has no dry level or temperature.
const RACK_DRY = buf(
    'aa4030ec001b010037003702000303000400000000a80000000000000073000000001b010032003213000000000400000000a800000000000000730000003cbb',
)
const TIME_DRY = buf(
    'aa4030ec001b010032003213000000000400000000a80000000000000073000000001b010028002812000005030400000000a8000000000000007300000008bb',
)
// Antibacterial on Heavy Duty.
const ANTIBACTERIAL_ON = buf(
    'aa4030ec001b010036003601000305000400000000a80000000000000073000000001b010114011401000505000400000080a80000000000000073000000f3bb',
)
// Wrinkle Care on, alongside the 0x40 panel-awake bit.
const WRINKLE_CARE_ON = buf(
    'aa4030ec001b010019001910000005000400000040a80000000000000073000000001b010019001910000005000400000050a80000000000000073000000cfbb',
)
const DAMP_DRY_SIGNAL_ON = buf(
    'aa4030ec001b010039003903000303000400000000aa0000000000000073000000001b010039003903000303000400000008aa00000000000000730000002bbb',
)
const SIGNAL_OFF_TO_LOW = buf(
    'aa4030ec001b010039003903000303000000000000aa0000000000000073000000001b010039003903000303000100000000aa00000000000000730000003abb',
)
// More/Less Time -2 on Speed Dry.
const LESS_TIME = buf(
    'aa4030ec001b010019001910000005000400000000a80000000000000073000000001b0100170017100000050004fe000000a8000000000000007300000051bb',
)
// Time Dry temperature High -> Low.
const TEMP_LOW = buf(
    'aa4030ec001b010100010012000005050400000000a80000000000000073000000001b010100010012000002050400000000a80000000000000073000000e0bb',
)
const CONTROL_LOCK_ON = buf(
    'aa4030ec001b010100010012000005050400000000a80000000000000073000000001b010100010012000005050400000001a80000000000000073000000ecbb',
)
const REMOTE_START_ON = buf(
    'aa4030ec001b010100010012000005050400000000a80000000000000073000000001b010100010012000005050400000000a90000000000000073000000ecbb',
)
const POWER_OFF = buf(
    'aa4030ec001b010100010012000005050400000000a80000000000000073000000001b000100010000000000000400000000a80000000100000073000000c9bb',
)

// A full run, checked against the LG cloud's state where noted. Starts on Bedding.
const STARTS_DRYING = buf(
    'aa4030ec001b010037003707000303000400000000a80000000000000073000000001b320037003707000303000400000000a80000000100000073000000f1bb',
)
// Remote Start (enabled on the panel) turns on once running.
const REMOTE_START_RUNNING = buf(
    'aa4030ec001b320037003707000303000400000000a80000000100000073000000001b320037003707000303000400000000a9000000010000007300000082bb',
)
const PAUSES = buf(
    'aa4030ec001b320037003707000303000400000000a90000000100000073000000001b030037003707000303000400000040a800002a320000007300000016bb',
)
const RESUMES = buf(
    'aa4030ec001b030037003707000303000400000040a800002a3200000073000000001b320037003707000303000400000000a800002a03000000730000003bbb',
)
// The moisture sensor extends the course; cloud: remainTimeMinute 16, initialTime 1:05.
const SENSOR_EXTENDS = buf(
    'aa4030ec001b320006003707000303000400000000a9000b430300000073000000001b320010010507000303000400000000a9000b9a030000007300000013bb',
)
// Switched to Time Dry 14 min with Wrinkle Care from the app; cloud: TIMEDRY, moreLessTime 230 (-26).
const TIME_DRY_WRINKLE_CARE = buf(
    'aa4030ec001b0300140014120000050304ec000040a90000093200000073000000001b32000e000e120000050304e6000010a90000000300000073000000dcbb',
)
// cloud: COOLING
const COOLING = buf(
    'aa4030ec001b320006000e120000050304e6000010a90001750300000073000000001b330005000e120000050304e6000010a900019e320000007300000027bb',
)
// cloud: END, REMOTE_START_OFF
const ENDS = buf(
    'aa4030ec001b330001000e120000050304e6000010a90001ae3200000073000000001b040001000f120000050304e6000050a80001b23300000073000000adbb',
)

// cloud: WRINKLECARE after END; rec[4:6] counts its minutes upward.
const WRINKLE_CARE_PHASE = buf(
    'aa4030ec001b040001000f120000050304e6000050a80001b23300000073000000001b3800010001120000050304e6000050a90001b2040000007300000053bb',
)
const WRINKLE_CARE_8_MIN = buf(
    'aa4030ec001b3800010007120000050304e6000010a90001b30400000073000000001b3800010008120000050304e6000010a90001b30400000073000000d8bb',
)

// Kid's Clothes downloaded from the app, knob on Downloaded Cycle; cloud: KIDWEAR, TEMP_HIGH, 35 min.
const KIDS_CLOTHES_DOWNLOADED = buf(
    'aa4030ec001b010039003903000303000400000040aa0001b30000000073000000001b01002300230c000305000400000040a80001b30066000066000000c1bb',
)

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

describe('RV13B6AM_D_US_WIFI', () => {
    test('Normal at its defaults', () => {
        const p = feed([NORMAL_DEFAULT])
        assert.equal(p.power, 'ON')
        assert.equal(p.status, 'Initial')
        assert.equal(p.course, 'Normal')
        assert.equal(p.dry_level, 'Normal')
        assert.equal(p.temp, 'Medium')
        assert.equal(p.signal, 'High')
        assert.equal(p.remaining_time, 57)
        assert.equal(p.initial_time, 57)
        assert.equal(p.energy_saver, 'ON')
        assert.equal(p.energy_saver_default, 'ON')
    })

    test('the Energy Saver default (rec[16] bit 0x80) is independent of Energy Saver itself', () => {
        const p = feed([NORMAL_DEFAULT, ENERGY_SAVER_DEFAULT_OFF])
        assert.equal(p.energy_saver_default, 'OFF')
        assert.equal(p.energy_saver, 'OFF')
        assert.equal(p.remaining_time, 41)

        // Remote Start, Control Lock etc. leave the default set in every record
        const q = feed([REMOTE_START_ON])
        assert.equal(q.energy_saver_default, 'ON')
        assert.equal(q.energy_saver, 'OFF')
    })

    test('courses only this model has: Small Load and Rack Dry', () => {
        const small = feed([SMALL_LOAD])
        assert.equal(small.course, 'Small Load')
        assert.equal(small.remaining_time, 30)

        const rack = feed([RACK_DRY])
        assert.equal(rack.course, 'Rack Dry')
        assert.equal(rack.remaining_time, 50)
    })

    test('the Downloaded Cycle position reports the loaded course', () => {
        const p = feed([DOWNLOADED])
        assert.equal(p.course, 'Bedding')
        assert.equal(p.dry_level, 'Very')
        assert.equal(p.remaining_time, 65)
    })

    test("a downloaded Kid's Clothes reports its own base course", () => {
        const p = feed([KIDS_CLOTHES_DOWNLOADED])
        assert.equal(p.course, "Kid's Clothes")
        assert.equal(p.temp, 'High')
        assert.equal(p.dry_level, 'Normal')
        assert.equal(p.remaining_time, 35)
    })

    test('Antibacterial is an option on top of a course, not a course', () => {
        const p = feed([ANTIBACTERIAL_ON])
        assert.equal(p.antibacterial, 'ON')
        assert.equal(p.course, 'Heavy Duty')
        assert.equal(p.dry_level, 'Very')
        assert.equal(p.remaining_time, 80)
        // the neighbouring rec[15] options are untouched
        assert.equal(p.child_lock, 'OFF')
        assert.equal(p.wrinkle_care, 'OFF')
        assert.equal(p.damp_dry_signal, 'OFF')
    })

    test('rec[15] options are decoded independently of the 0x40 base bit', () => {
        const wrinkle = feed([WRINKLE_CARE_ON])
        assert.equal(wrinkle.wrinkle_care, 'ON')
        assert.equal(wrinkle.antibacterial, 'OFF')

        const damp = feed([DAMP_DRY_SIGNAL_ON])
        assert.equal(damp.damp_dry_signal, 'ON')
        assert.equal(damp.wrinkle_care, 'OFF')

        const lock = feed([CONTROL_LOCK_ON])
        assert.equal(lock.child_lock, 'ON')
        assert.equal(lock.antibacterial, 'OFF')
    })

    test('Time Dry and its temperature', () => {
        const p = feed([TIME_DRY])
        assert.equal(p.course, 'Time Dry')
        assert.equal(p.temp, 'High')
        assert.equal(p.remaining_time, 40)

        assert.equal(feed([TEMP_LOW]).temp, 'Low')
    })

    test('Signal and More/Less Time', () => {
        assert.equal(feed([SIGNAL_OFF_TO_LOW]).signal, 'Low')

        const p = feed([LESS_TIME])
        assert.equal(p.course, 'Speed Dry')
        assert.equal(p.more_less_time, -2)
        assert.equal(p.remaining_time, 23)
    })

    test('a real run: Initial -> Drying -> Pause -> Drying', () => {
        const started = feed([STARTS_DRYING])
        assert.equal(started.status, 'Drying')
        assert.equal(started.course, 'Bedding')
        assert.equal(started.remaining_time, 55)

        assert.equal(feed([STARTS_DRYING, REMOTE_START_RUNNING]).remote_start, 'ON')

        const paused = feed([STARTS_DRYING, REMOTE_START_RUNNING, PAUSES])
        assert.equal(paused.status, 'Pause')
        assert.equal(paused.power, 'ON')

        assert.equal(feed([STARTS_DRYING, PAUSES, RESUMES]).status, 'Drying')
    })

    test('a sensor extension raises both the remaining time and the initial estimate', () => {
        const p = feed([SENSOR_EXTENDS])
        assert.equal(p.remaining_time, 16)
        assert.equal(p.initial_time, 65)
    })

    test('Time Dry with a More/Less trim and Wrinkle Care, mid-run', () => {
        const p = feed([TIME_DRY_WRINKLE_CARE])
        assert.equal(p.course, 'Time Dry')
        assert.equal(p.status, 'Drying')
        assert.equal(p.remaining_time, 14)
        assert.equal(p.more_less_time, -26)
        assert.equal(p.wrinkle_care, 'ON')
    })

    test('the run finishes: Cooling -> End', () => {
        const cooling = feed([TIME_DRY_WRINKLE_CARE, COOLING])
        assert.equal(cooling.status, 'Cooling')
        assert.equal(cooling.remaining_time, 5)

        const ended = feed([TIME_DRY_WRINKLE_CARE, COOLING, ENDS])
        assert.equal(ended.status, 'End')
        assert.equal(ended.power, 'ON')
        assert.equal(ended.remote_start, 'OFF')
        assert.equal(ended.wrinkle_care, 'ON') // still tumbling for Wrinkle Care after End
    })

    test('End -> Wrinkle Care is its own phase, not the generic Running fallback', () => {
        const p = feed([TIME_DRY_WRINKLE_CARE, COOLING, ENDS, WRINKLE_CARE_PHASE])
        assert.equal(p.status, 'Wrinkle Care')
        assert.equal(p.power, 'ON')
        assert.equal(p.remote_start, 'ON')

        assert.equal(feed([WRINKLE_CARE_PHASE, WRINKLE_CARE_8_MIN]).initial_time, 8)
    })

    test('power off clears the selection', () => {
        const p = feed([POWER_OFF])
        assert.equal(p.power, 'OFF')
        assert.equal(p.status, 'Off')
        assert.equal(p.course, 'None')
        assert.equal(p.remaining_time, 0)
    })

    test('start() requests a status snapshot', () => {
        const { thinq, dev } = makeDevice()
        dev.start()
        assert.deepEqual(
            thinq.outbox.map((b) => b.toString('hex')),
            ['aa0ef0ed1121010000001800b5bb'],
        )
    })
})
