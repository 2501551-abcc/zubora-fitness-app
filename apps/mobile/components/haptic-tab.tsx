import * as Haptics from 'expo-haptics';
import { Pressable, PressableProps } from 'react-native';

export function HapticTab(props: PressableProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // iOSでタブをタップした瞬間に軽い振動フィードバックを発生させる
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}