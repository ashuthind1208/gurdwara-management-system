import authService, { resolveGoogleOAuthRedirectUri } from './authService';
import userService from './userService';

jest.mock('./userService', () => ({
  __esModule: true,
  default: {
    getUserByEmail: jest.fn(),
    upsertUserByEmail: jest.fn()
  }
}));

describe('inactive Member authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('blocks an inactive pending Member applicant', async () => {
    const applicant = {
      id: 'pending-member',
      name: 'Pending Member',
      email: 'pending@example.com',
      role: 'Member',
      memberType: 'Member',
      approvalStatus: 'pending',
      isActive: false
    };
    userService.getUserByEmail.mockResolvedValue({ data: applicant });
    await expect(authService.loginWithGoogle({
      email: applicant.email,
      name: applicant.name,
      intent: 'signup'
    })).rejects.toThrow('Admin has marked your account inactive. Please contact admin for access.');
  });

  test('continues blocking an inactive approved account', async () => {
    userService.getUserByEmail.mockResolvedValue({
      data: {
        id: 'inactive-approved-member',
        email: 'inactive@example.com',
        role: 'Member',
        approvalStatus: 'approved',
        isActive: false
      }
    });

    await expect(authService.loginWithGoogle({
      email: 'inactive@example.com',
      intent: 'signin'
    })).rejects.toThrow('Admin has marked your account inactive. Please contact admin for access.');
  });

  test('keeps the Google OAuth access token for endpoints that verify it server-side', async () => {
    const user = { id: 'verified-user', email: 'admin@example.test', name: 'Admin', role: 'Super Admin', approvalStatus: 'approved', isActive: true };
    userService.getUserByEmail.mockResolvedValue({ data: user });
    userService.upsertUserByEmail.mockResolvedValue({ data: user });
    const response = await authService.loginWithGoogle({
      email: user.email,
      name: user.name,
      googleAccessToken: 'real-google-access-token'
    });
    expect(response.data.token).toBe('real-google-access-token');
  });
});

describe('Google OAuth redirect URI', () => {
  test('uses the configured localhost callback for a 127.0.0.1 development origin', () => {
    expect(resolveGoogleOAuthRedirectUri('http://127.0.0.1:3001', 'http://localhost:3001/login')).toBe('http://localhost:3001/login');
  });

  test('uses the current origin callback for production or unrelated hosts', () => {
    expect(resolveGoogleOAuthRedirectUri('https://singhsabhamilton.com', 'http://localhost:3001/login')).toBe('https://singhsabhamilton.com/login');
    expect(resolveGoogleOAuthRedirectUri('http://127.0.0.1:3001', '')).toBe('http://127.0.0.1:3001/login');
  });
});