// Cognito Configuration
const authConfig = {
  userPoolId: 'us-east-1_49CPTZ69g',
  clientId: '103rc1ube3j0ekl6uas50j63lk',
  region: 'us-east-1',
  domain: 'https://us-east-149cptz69g.auth.us-east-1.amazoncognito.com',
  redirectUri: 'http://localhost:8080'
};

export function getLoginUrl() {
  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: authConfig.redirectUri,
  });
  
  return `${authConfig.domain}/login?${params}`;
}

export function handleCallback() {
  // Parse hash fragment for tokens
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (code) {
    // Exchange code for tokens
    return fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    })
    .then(res => res.json())
    .then(data => {
      if (data.idToken) {
        localStorage.setItem('cognitoIdToken', data.idToken);
        // Clean up the URL
        window.history.replaceState(null, '', window.location.pathname);
        return true;
      }
      return false;
    })
    .catch(err => {
      console.error('Token exchange failed:', err);
      return false;
    });
  }
  return false;
}

export function isAuthenticated() {
  return !!localStorage.getItem('cognitoIdToken');
}

export function getIdToken() {
  return localStorage.getItem('cognitoIdToken');
}

export function signOut() {
  localStorage.removeItem('cognitoIdToken');
  const params = new URLSearchParams({
    client_id: authConfig.clientId,
    logout_uri: `${window.location.origin}/signout`,
  });
  window.location.href = `${authConfig.domain}/logout?${params}`;
}