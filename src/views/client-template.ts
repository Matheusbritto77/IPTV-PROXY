type ClientCardInput = {
  clientName: string;
  username: string;
  password: string;
  smartersUrl: string;
  xciptvDns: string;
  expiresAt: string;
};

export function renderClientCard(input: ClientCardInput) {
  return [
    `Cliente -> ${input.clientName}`,
    `Login: ${input.username}`,
    `Senha: ${input.password}`,
    `SMARTER: ${input.smartersUrl}`,
    `DNS XCIPTV: ${input.xciptvDns}`,
    `Vencimento: ${input.expiresAt}`,
  ].join("\n");
}
