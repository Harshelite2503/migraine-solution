// Questionnaire: three short pages, no sound. Original, non-diagnostic wording (validated scales
// such as HIT-6 or ASC-12 are licensed and are not used).
import { View } from 'react-native';
import type { Category, Intake as IntakeT, Profile } from '../../lib/profile';
import { Muted } from '../../lib/ui';
import { Pick, PickMany, SCALE_0_4 } from './Choices';

type Props = { profile: Profile; onChange: (p: Profile) => void };
const set = (props: Props, patch: Partial<IntakeT>) => props.onChange({ ...props.profile, intake: { ...props.profile.intake, ...patch } });

export function AboutHeadaches(props: Props) {
  const i = props.profile.intake;
  return (
    <View>
      <Muted small>About your headaches. This picks safe starting points. It is not a test or a diagnosis.</Muted>
      <Pick label="During a headache, how often do sounds bother you?" value={i.attackSoundBother} onChange={v => set(props, { attackSoundBother: v })}
        options={[{ value: 0, label: 'Never' }, { value: 1, label: 'Sometimes' }, { value: 2, label: 'Usually' }, { value: 3, label: 'Always' }]} />
      <Pick label="Which symptom bothers you most?" value={i.worstSymptom} onChange={v => set(props, { worstSymptom: v })}
        options={[{ value: 'pain', label: 'The pain' }, { value: 'light', label: 'Light' }, { value: 'sound', label: 'Sound' }, { value: 'nausea', label: 'Nausea' }, { value: 'other', label: 'Something else' }]} />
      <Pick label="Do you get aura (visual or other changes before or during a headache)?" value={i.aura} onChange={v => set(props, { aura: v })}
        options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} />
      <Pick label="About how many headache days a month?" value={i.attacksPerMonth} onChange={v => set(props, { attacksPerMonth: v })}
        options={[{ value: '1-3', label: '1–3' }, { value: '4-7', label: '4–7' }, { value: '8-14', label: '8–14' }, { value: '15+', label: '15 or more' }]} />
      <PickMany label="What else bothers you during a headache?" hint="Choose any." value={i.otherSensitivities} onChange={v => set(props, { otherSensitivities: v })}
        options={[{ value: 'light', label: 'Light' }, { value: 'smell', label: 'Smells' }, { value: 'motion', label: 'Movement' }, { value: 'touch', label: 'Touch, like hair or glasses' }]} />
      <Pick label="How dizzy do you get?" value={i.dizziness} onChange={v => set(props, { dizziness: v })} options={SCALE_0_4} />
      <Pick label="How anxious do you usually feel during a headache?" value={i.anxietyDuringAttacks} onChange={v => set(props, { anxietyDuringAttacks: v })}
        options={[{ value: 0, label: 'Not much' }, { value: 1, label: 'Somewhat' }, { value: 2, label: 'Very' }]} />
      <PickMany label="What helps you now?" hint="Choose any." value={i.currentlyHelps} onChange={v => set(props, { currentlyHelps: v })} exclusive={['nothing']}
        options={[{ value: 'silence', label: 'Silence' }, { value: 'darkness', label: 'Darkness' }, { value: 'nature', label: 'Nature sounds' }, { value: 'music', label: 'Music' }, { value: 'noise', label: 'White or brown noise' }, { value: 'nothing', label: 'Nothing really' }]} />
    </View>
  );
}

const BOTHER: { key: keyof NonNullable<IntakeT['bother']>; label: string }[] = [
  { key: 'sudden', label: 'Sudden sounds, like a door or a notification' },
  { key: 'high', label: 'High, hissy sounds, like a kettle or static' },
  { key: 'low', label: 'Low rumbling, like traffic or a fridge' },
  { key: 'pulse', label: 'Pulsing or throbbing sounds' },
  { key: 'voices', label: 'Voices and conversation' },
  { key: 'repetitive', label: 'Repetitive sounds, like ticking or tapping' },
  { key: 'mouth', label: 'Mouth sounds, like chewing or breathing' },
];

export function Sensitivities(props: Props) {
  const b = props.profile.intake.bother || {};
  return (
    <View>
      <Muted small>How much does each kind of sound bother you, in general and during a headache?</Muted>
      {BOTHER.map(q => (
        <Pick key={q.key} label={q.label} value={b[q.key]} options={SCALE_0_4}
          onChange={v => set(props, { bother: { ...b, [q.key]: v } })} />
      ))}
    </View>
  );
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'rain', label: 'Rain' }, { value: 'ocean', label: 'Ocean waves' }, { value: 'stream', label: 'Running water' },
  { value: 'wind', label: 'Wind' }, { value: 'birds', label: 'Birds' }, { value: 'fan', label: 'Fan or air' },
  { value: 'hum', label: 'Low hum or drone' }, { value: 'bowls', label: 'Singing bowls' }, { value: 'piano', label: 'Soft piano' },
  { value: 'voices', label: 'Soft voices' }, { value: 'silence', label: 'Silence' },
];

export function Likes(props: Props) {
  const i = props.profile.intake;
  const loves = i.loves || [], dislikes = i.dislikes || [];
  return (
    <View>
      <PickMany label="Sounds you find soothing" value={loves} options={CATEGORIES}
        onChange={v => set(props, { loves: v, dislikes: dislikes.filter(d => !v.includes(d)) })} />
      <PickMany label="Sounds you can't stand" hint="Still will avoid these." value={dislikes} options={CATEGORIES}
        onChange={v => set(props, { dislikes: v, loves: loves.filter(l => !v.includes(l)) })} />
      <Pick label="How do you usually listen?" value={i.listening} onChange={v => set(props, { listening: v })}
        options={[{ value: 'earbuds', label: 'Earbuds' }, { value: 'headphones', label: 'Headphones' }, { value: 'speaker', label: 'Phone or speaker' }, { value: 'pillow', label: 'Pillow speaker' }]} />
      <Pick label="What do you most want from the sound?" value={i.goal} onChange={v => set(props, { goal: v })}
        options={[{ value: 'rest', label: 'Rest in the dark' }, { value: 'sleep', label: 'Fall asleep' }, { value: 'distract', label: 'Take my mind off it' }, { value: 'focus', label: 'Get through the day' }]} />
    </View>
  );
}
