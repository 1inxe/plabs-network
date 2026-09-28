import type { Preview } from '@storybook/react-vite';
import '../src/shared/styles/index.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { options: { dark: { name: 'Obsidian', value: '#0d1116' } } },
    a11y: { test: 'error' },
  },
  initialGlobals: { backgrounds: { value: 'dark' } },
};
export default preview;
