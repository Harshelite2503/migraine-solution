// /welcome: the web landing page. One shared route file; the platform split lives in the component
// (Metro picks Landing.web.tsx on web and Landing.tsx on native, which redirects to the Quiet room).
import { Landing } from '../components/landing/Landing';

export default function Welcome() {
  return <Landing />;
}
