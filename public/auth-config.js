const authConfig = {
  clientId: '103rc1ube3j0ekl6uas50j63lk',
  domain: 'https://us-east-149cptz69g.auth.us-east-1.amazoncognito.com',
  redirectUri: 'http://localhost:8080'
};

export function getLoginUrl() {
  return "https://us-east-149cptz69g.auth.us-east-1.amazoncognito.com/login?client_id=103rc1ube3j0ekl6uas50j63lk&response_type=code&scope=email+openid+phone&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2F";
}

export function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  
  if (code) {
    // Exchange authorization code for tokens by calling our backend
    return fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    })
    .then(res => {
      if (!res.ok) {
        throw new Error('Token exchange request failed');
      }
      return res.json();
    })
    .then(data => {
      if (data.idToken) {
        localStorage.setItem('cognitoIdToken', data.idToken);
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
  return Promise.resolve(false);
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
    logout_uri: authConfig.redirectUri,
  });
  // Redirect to the Cognito logout page
  window.location.href = `${authConfig.domain}/logout?${params}`;
}