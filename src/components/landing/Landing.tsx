// Native build of the landing route: there is no landing page on a phone, the store listing is it.
// Anyone who lands on /welcome (a deep link, say) goes straight to the Quiet room.
import { Redirect } from 'expo-router';

export function Landing() {
  return <Redirect href="/" />;
}
