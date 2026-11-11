import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

describe('PayConnect app', () => {
  it('renders the secure sign-in surface', () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(screen.getByText('Your money, connected.')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});
