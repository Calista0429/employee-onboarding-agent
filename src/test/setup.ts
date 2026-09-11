import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement the layout APIs the app calls while scrolling. Node-environment suites
// share this setup file, so the guards are required.
if (typeof Element !== 'undefined') Element.prototype.scrollIntoView = () => {};
if (typeof window !== 'undefined') window.scrollTo = () => {};

afterEach(cleanup);
