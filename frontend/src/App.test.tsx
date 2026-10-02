import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('states the core product promise', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Wealth Master' })).toBeInTheDocument();
    expect(screen.getByText(/trustworthy and explainable/i)).toBeInTheDocument();
  });
});
