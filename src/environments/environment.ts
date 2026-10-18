/**
 * The production build (npm run build): users, roles and activity come from the server, at /api on the app's own
 * origin. angular.json swaps in environment.sample-data.ts while developing (npm start) and for the demo build
 * (npm run build:demo), so a build meant for real use never runs on sample data with no real sign-in.
 */
export const environment = {
  sampleData: false,
};
