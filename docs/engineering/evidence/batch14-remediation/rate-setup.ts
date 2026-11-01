import { runBrowserSetup } from '../../../../tests/e2e/setup';
export default async function setup() {
  return runBrowserSetup({ demo: true, feedbackRateMax: 8 });
}
