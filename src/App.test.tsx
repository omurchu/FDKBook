import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Wayfinding app shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /wayfinding/i })).toBeInTheDocument();
});
