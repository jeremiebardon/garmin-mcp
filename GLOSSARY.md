# Garmin MCP

An MCP server that lets an AI assistant answer questions about an athlete's Garmin training and wellness data, grounded in running literature.

## Language

### Athlete data

**Activity**:
One recorded workout on Garmin Connect (a run, a ride, etc.), identified by its Garmin activity id.
_Avoid_: Workout (Garmin uses that for the planned structure), session

**FIT File**:
The original binary recording of an Activity as produced by the device, holding per-second records, laps and events.
_Avoid_: Raw file, track

**Wellness Data**:
Non-activity daily metrics from Garmin: sleep, HRV, resting heart rate, stress, Body Battery, steps, weight.
_Avoid_: Health data, biometrics

**Athlete**:
The single person whose Garmin data the server exposes.
_Avoid_: User, runner

**Sync**:
One run that brings the local copy of the Athlete's Garmin data up to date with Garmin Connect; the server only ever reads from the local copy.
_Avoid_: Import, fetch, refresh

**Missing Day**:
A day for which Garmin was asked for a given kind of Wellness Data and had none, as opposed to a day not yet synced; never read as zero.
_Avoid_: Gap, empty day

**Timer Time**:
The time during which the Activity's timer was running, excluding pauses.
_Avoid_: Duration, moving time, elapsed time (both mean other things in Garmin)

### Training structure

**Workout**:
The planned structure of a session, made of Workout Steps, created in Garmin Connect and embedded in the Activity it was run with.
_Avoid_: Plan, session

**Workout Step**:
One planned element of a Workout (warmup, work, rest, recovery or cooldown), with a duration and an optional target.

**Lap**:
A segment of an Activity recorded by the device, closed by an auto-lap distance, a Workout Step boundary, a button press or the end of the Activity.
_Avoid_: Split (Garmin's split summaries are aggregates by type, not segments)

**Rep**:
One executed work Workout Step in an Interval Session; it spans one or more consecutive Laps.
_Avoid_: Interval, repetition, effort

**Recovery**:
The rest or recovery Lap(s) immediately following a Rep.
_Avoid_: Rest interval

**Interval Session**:
An Activity containing at least one Rep.
_Avoid_: Structured workout, fractionné

**Continuous Run**:
A running Activity with no Rep, whatever Workout was attached and however much the pace varied.
_Avoid_: Easy run (that names an intent, not a structure)

**Race**:
An Activity the Athlete has declared as a race, together with its official distance.
_Avoid_: Competition, best effort

**Race Candidate**:
An Activity the server suggests might be a Race; never treated as one until the Athlete declares it.
_Avoid_: Detected race, probable race

### Running analytics

**Derived Metrics**:
The per-Activity numbers the server computes from the FIT File (Reps, HRRc, HR Zone time, Training Load, Aerobic Decoupling), as opposed to the summary values Garmin reports.
_Avoid_: Garmin metrics, stats

**HR Zone**:
One of the five heart-rate bands configured in Garmin as fractions of heart-rate reserve; time below Zone 1 is Zone 0.
_Avoid_: Training zone, intensity zone

**HRRc**:
Heart-rate recovery: how many beats per minute the heart rate drops in the first 60 seconds of a Recovery, measured from the end of the Rep.
_Avoid_: HRR (that is heart-rate reserve), recovery heart rate

**Training Load**:
The physiological cost of an Activity as a Banister TRIMP score, and its accumulation over days into fatigue (ATL), fitness (CTL) and form (TSB).
_Avoid_: Training stress, effort score

**Aerobic Decoupling**:
The percentage by which the ratio of speed to heart rate degrades from the first half to the second half of a Continuous Run.
_Avoid_: Cardiac drift (the related heart-rate-only phenomenon)

**VDOT**:
Daniels' performance index of running fitness, derived from a Race result.
_Avoid_: VO2max (a lab measure, and Garmin's estimate is not available here)

**Training Paces**:
The Daniels pace bands (Easy, Marathon, Threshold, Interval, Repetition) derived from the current VDOT.
_Avoid_: Pace zones

**Weekly Volume**:
The running totals of one Monday-to-Sunday week in the Athlete's timezone.
_Avoid_: Mileage

### Knowledge

**Knowledge Base**:
The collection of Running Books, mirrored from a folder the Athlete manages, that the assistant searches to ground its coaching answers.
_Avoid_: Library, docs, corpus

**Running Book**:
A PDF of running or training literature (e.g. a training-plan book) placed in the Knowledge Base, identified by its content rather than its file name.
_Avoid_: Document, PDF (when meaning the content)

**Passage**:
A contiguous excerpt of a Running Book returned by a Knowledge Base search, located by chapter, section and pages so it can be cited.
_Avoid_: Chunk, snippet, extract
