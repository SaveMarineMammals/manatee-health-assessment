/**
 * Component tests for the app shell.
 *
 * jest-expo supplies the React Native environment; the domain packages are
 * tested with vitest and never need this. Workspace packages are consumed from
 * their built dist/, matching what Metro resolves on device.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|expo|expo-.*|@expo|@manatee)',
  ],
};
