# Running analytics

What the MVP computes and exactly how. Vocabulary (Lap, Rep, Recovery, Interval Session, Continuous Run, Race, Timer Time, HR Zone, HRRc, Training Load, Aerobic Decoupling, VDOT, Training Paces, Weekly Volume) is defined in `GLOSSARY.md`.

## Ships in the MVP

1. Rep table (pace, HR, HRRc per Rep)
2. HR Zone time-in-zone
3. Weekly Volume
4. Training Load: Banister TRIMP + ATL / CTL / TSB
5. Aerobic Decoupling
6. VDOT → Training Paces + race predictions

## Deferred

- **Grade-adjusted pace**: the Athlete's watch has no barometer, so altitude is GPS-only and can be missing. Garmin's elevation-corrected ascent from the API is still reported.
- **Riegel**: dropped. A second predictor that disagrees with VDOT would confuse more than help.
- **Interval detection from the stream**: a fartlek run on a single-step Workout stays a Continuous Run.
- **HRV from RR intervals**: present in too few FIT Files.

## Reps and Recoveries

- A **Rep** is the longest run of consecutive Laps with the same Workout Step index (`wkt_step_index`) and intensity `active` or `interval`.
- Reps exist only in an Activity with at least one `rest` or `recovery` Lap. Warmup and cooldown Laps are never Reps.
- Auto-lap can split one Workout Step into several Laps (1500 m → 1000 + 500, 2 km → 1000 + 1000); grouping by step index joins them back.
- A **Recovery** is the `rest` / `recovery` Lap or Laps right after a Rep.
- An Activity without Reps is a **Continuous Run**.

## Time base

- Pace uses Timer Time.
- Stream metrics use only the records while the timer runs (between timer start and stop / stopAll events).
- Elapsed time is reported but never used in a calculation.
- The canonical start time is the API `startTimeGMT`. FIT time is used only as an offset from that start.
- Days and weeks are bucketed in the profile timezone. Weeks run Monday to Sunday.

## Units

- Pace: s/km as a number, plus `m:ss/km`.
- Distance: m in calculations, km to 2 dp in output.
- HR: integer bpm.
- Durations: s, plus `h:mm:ss`.
- TRIMP: dimensionless, 1 dp.
- Metric only.

## Data quality

- Every metric returns a value, or `null` with a reason code ([mcp-surface.md](mcp-surface.md#reason-codes)). Gaps are never filled with zero.
- HR gaps of 5 s or less are interpolated linearly.
- An HR metric is `null` (`hr_coverage_low`) when HR covers less than 90% of the Timer Time in its window.
- A GPS dropout does not invalidate pace: distance is still recorded.
- Optical-HR lag at the start is not corrected.
- Treadmill runs count toward volume and load, and are excluded from VDOT and decoupling (`treadmill`).

## Races

- Declared by the Athlete with the official distance, and stored locally. Never written to Garmin.
- **Race Candidates** are detected automatically (distance within 2% of a standard distance, plus high HR) and offered, but never applied without the Athlete's confirmation. Garmin tags nothing as a race (`eventType` is `uncategorized` on every Activity).
- With no Race, VDOT is `null` (`no_race`).

## HR Zones

- Garmin's configured zones from the API: method `HR_RESERVE`, with floors at 50 / 60 / 70 / 80 / 90% of heart-rate reserve above RHR.
- Time-in-zone is computed from the 1 Hz stream. Time below Zone 1 counts as Zone 0.
- The current zone configuration applies to all history.
- Pace bands are the Training Paces.

## Metric definitions

### HRRc

HRRc (bpm) = mean HR over the last 5 s of the Rep − mean HR over the 5 s ending 60 s after the Recovery starts.

- Anchored on the end of the Rep, not on the HR peak.
- 60 s window only (90 s rests are common, so 120 s is not computed).
- `null` with `recovery_too_short` if the Recovery has less than 60 s of Timer Time, or `pause_in_window` if a timer pause falls in the window.
- Reported with the Recovery's average pace, because jog recoveries and standing rests give very different HRRc. No automatic classification.

### Rep table

One row per Rep:

- number;
- distance and Timer Time, summed over its Laps;
- pace;
- average and max HR;
- the Workout Step's pace target range;
- compliance: `faster`, `within`, `slower` or `no target`;
- the Recovery's Timer Time, average pace and HRRc;
- HR Zone seconds.

### HR time-in-zone

Seconds in each Zone 0–5 over Timer Time, per Activity and per Rep.

### Aerobic Decoupling (Pa:HR)

- Window: the Timer Time after the first 10 min, split into two halves by time.
- EF = mean speed / mean HR, for each half.
- Decoupling (%) = (EF₁ − EF₂) / EF₁ × 100.
- Continuous Runs with at least 45 min of Timer Time only (`not_continuous_run`, `too_short`).
- Reported with total ascent.

### TRIMP (Banister)

Summed per second over Timer Time:

TRIMP = Σ Δt(min) × HRr × 0.64 × e^(k · HRr), with HRr = (HR − RHR) / (maxHR − RHR), clamped to [0, 1].

- RHR and max HR come from the HR Zone configuration.
- k comes from the FIT `userProfile.gender`: 1.92 for male (Banister's female coefficient, 1.67, for female). It is exposed as `trimpSexCoefficient`.
- Every Activity with HR counts, of any sport, except lap swimming.
- Below 90% HR coverage, the Activity's load is `null` and its day is marked `incompleteDay`.

### ATL / CTL / TSB

- Daily load = the sum of TRIMP for the local day. A day with no Activity is a real 0.
- X_d = X_{d−1} + (load_d − X_{d−1}) / τ, with τ = 7 for ATL and 42 for CTL.
- TSB_d = CTL_{d−1} − ATL_{d−1}.
- Both start at 0 on the day of the oldest Activity. CTL is flagged `ctlWarmingUp` for its first 42 days.

### VDOT (Daniels–Gilbert)

- VO2 = −4.60 + 0.182258 · v + 0.000104 · v², with v in m/min.
- %max = 0.8 + 0.1894393 · e^(−0.012778 · t) + 0.2989558 · e^(−0.1932605 · t), with t in min.
- VDOT = VO2 / %max.
- Current VDOT = the highest VDOT from Races in the last 12 weeks; otherwise the most recent Race's, flagged `vdotStale`.
- Orphaned Races (whose Activity was deleted in Garmin) and treadmill runs are excluded.

### Race predictions

The time at which VDOT(distance, time) equals the current VDOT, for 5K, 10K, HM and M.

### Training Paces

The speed at which VO2 = f × VDOT:

| Pace | f |
|---|---|
| E (range) | 0.59 – 0.74 |
| M | the marathon-equivalent pace |
| T | 0.88 |
| I | 0.975 |
| R | 1.05 |

Daniels' copyrighted tables are not reproduced, so values can differ from the book by a few s/km.

### Weekly Volume

Running only, per Monday-to-Sunday week:

- distance;
- Timer Time;
- number of runs;
- longest run;
- ascent (Garmin's corrected value);
- time in each HR Zone;
- summed Training Load (all sports);
- % change in distance vs the previous week.

The current week is flagged `partial`.
