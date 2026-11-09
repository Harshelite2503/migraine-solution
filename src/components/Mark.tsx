// The app mark: a circle resting on a horizon line. Decorative; the word "Still" always sits beside it.
import { Platform } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../lib/theme';

/**
 * Hides a react-native-svg <Svg> from assistive tech. On web react-native-svg hands its props straight
 * to the DOM <svg>, where the native-only props become unknown attributes (React warns on every render),
 * so web gets `aria-hidden` alone.
 */
export const svgHidden: object = Platform.OS === 'web'
  ? { 'aria-hidden': true }
  : { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true };

export function Mark({ size = 24, color = colors.lamp, strokeWidth = 1.5 }: { size?: number; color?: string; strokeWidth?: number }) {
  // Drawn in a 24-unit box so the stroke stays 1.5 px at every size (vector-effect keeps it from scaling).
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" pointerEvents="none" {...svgHidden}>
      <Circle cx={12} cy={10.25} r={6.25} stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      <Line x1={2} y1={17.25} x2={22} y2={17.25} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </Svg>
  );
}
