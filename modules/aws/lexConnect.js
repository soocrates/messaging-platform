export async function generateBotResponse(userText, sessionId) {
  await new Promise((r) => setTimeout(r, 200));
  return `You said: "${userText}". (session ${sessionId})`;
}

// export async function startConnectVoiceCall(sessionId, phoneNumber) {
//   return { started: true, sessionId };
// }

