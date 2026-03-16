/**
 * Meta Embedded Signup Service
 *
 * Implementa o fluxo oficial de Embedded Signup para Tech Providers.
 * Ref: https://developers.facebook.com/docs/whatsapp/embedded-signup
 *
 * Fluxo:
 * 1. Cliente clica "Conectar WhatsApp" no frontend
 * 2. Facebook JS SDK abre o fluxo de Embedded Signup (FB.login)
 * 3. Meta retorna um `code` de autorização
 * 4. Backend troca o `code` por um access_token
 * 5. Backend resolve WABA ID, Phone Number ID, Business ID via Graph API
 * 6. Backend salva tudo na instância WhatsApp
 */

const META_GRAPH_API_VERSION = 'v21.0';
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export interface EmbeddedSignupConfig {
  /** App ID do Meta Business App */
  appId: string;
  /** App Secret */
  appSecret: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}

export interface SharedWABAInfo {
  wabaId: string;
  businessId: string;
  currency?: string;
  timezone?: string;
}

export interface PhoneNumberInfo {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  codeVerificationStatus: string;
}

export interface EmbeddedSignupResult {
  accessToken: string;
  wabaId: string;
  businessId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
}

/**
 * Troca o authorization code por um access token de longa duração.
 *
 * POST https://graph.facebook.com/v21.0/oauth/access_token
 *   ?client_id={app-id}
 *   &client_secret={app-secret}
 *   &code={code}
 */
export async function exchangeCodeForToken(
  code: string,
  config: EmbeddedSignupConfig
): Promise<TokenExchangeResult> {
  const url = `${META_GRAPH_API_BASE}/oauth/access_token`;
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    code,
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Token exchange failed (${response.status}): ${error?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'bearer',
    expiresIn: data.expires_in,
  };
}

/**
 * Busca informações do debug_token para encontrar shared WABAs.
 *
 * GET https://graph.facebook.com/v21.0/debug_token?input_token={user-token}
 */
export async function debugToken(
  inputToken: string,
  appToken: string
): Promise<any> {
  const url = `${META_GRAPH_API_BASE}/debug_token?input_token=${encodeURIComponent(inputToken)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${appToken}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `debug_token failed (${response.status}): ${error?.error?.message || response.statusText}`
    );
  }

  return (await response.json()).data;
}

/**
 * Busca o Shared WABA ID a partir do token do Embedded Signup.
 *
 * A Meta retorna o WABA ID dentro de granular_scopes do debug_token
 * ou via endpoint /me/businesses -> WABAs.
 *
 * Estratégia:
 * 1. debug_token -> granular_scopes -> whatsapp_business_management -> target_ids (WABA IDs)
 * 2. Se não encontrar, busca WABAs do business via Graph API
 */
export async function resolveSharedWABA(
  userToken: string,
  appId: string,
  appSecret: string
): Promise<SharedWABAInfo> {
  // App-level token for debug_token call
  const appToken = `${appId}|${appSecret}`;

  // Step 1: debug_token to find WABA IDs in granular_scopes
  const debugData = await debugToken(userToken, appToken);

  let wabaId: string | null = null;
  let businessId: string | null = null;

  // Extract from granular_scopes
  if (debugData?.granular_scopes) {
    for (const scope of debugData.granular_scopes) {
      if (scope.permission === 'whatsapp_business_management' && scope.target_ids?.length > 0) {
        wabaId = scope.target_ids[0]; // First shared WABA
      }
      if (scope.permission === 'business_management' && scope.target_ids?.length > 0) {
        businessId = scope.target_ids[0];
      }
    }
  }

  // Step 2: If no WABA from debug_token, try to list WABAs from business
  if (!wabaId && businessId) {
    const wabaUrl = `${META_GRAPH_API_BASE}/${businessId}/owned_whatsapp_business_accounts?fields=id,name,currency,timezone_id`;
    const wabaResponse = await fetch(wabaUrl, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (wabaResponse.ok) {
      const wabaData = await wabaResponse.json();
      if (wabaData?.data?.length > 0) {
        wabaId = wabaData.data[0].id;
      }
    }
  }

  // Step 3: If still no WABA, try shared WABAs
  if (!wabaId) {
    // Try to find shared WABAs via the user's businesses
    const meUrl = `${META_GRAPH_API_BASE}/me?fields=id,name`;
    const meResponse = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (meResponse.ok) {
      const meData = await meResponse.json();
      if (!businessId) businessId = meData.id;
    }
  }

  if (!wabaId) {
    throw new Error(
      'Não foi possível encontrar o WABA ID. Verifique se o cliente compartilhou a conta WhatsApp Business corretamente.'
    );
  }

  // Get WABA details
  if (!businessId) {
    try {
      const wabaDetailsUrl = `${META_GRAPH_API_BASE}/${wabaId}?fields=id,owner_business_info`;
      const detailsResponse = await fetch(wabaDetailsUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (detailsResponse.ok) {
        const details = await detailsResponse.json();
        businessId = details?.owner_business_info?.id || '';
      }
    } catch {
      // ignore
    }
  }

  return {
    wabaId,
    businessId: businessId || '',
  };
}

/**
 * Busca os números de telefone de um WABA.
 *
 * GET https://graph.facebook.com/v21.0/{waba-id}/phone_numbers
 */
export async function getWABAPhoneNumbers(
  wabaId: string,
  accessToken: string
): Promise<PhoneNumberInfo[]> {
  const url = `${META_GRAPH_API_BASE}/${wabaId}/phone_numbers?fields=id,verified_name,display_phone_number,quality_rating,code_verification_status`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to get phone numbers (${response.status}): ${error?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return (data.data || []).map((phone: any) => ({
    phoneNumberId: phone.id,
    displayPhoneNumber: phone.display_phone_number,
    verifiedName: phone.verified_name || '',
    qualityRating: phone.quality_rating || 'UNKNOWN',
    codeVerificationStatus: phone.code_verification_status || 'NOT_VERIFIED',
  }));
}

/**
 * Registra o webhook da app no WABA (subscribe to webhooks).
 *
 * POST https://graph.facebook.com/v21.0/{waba-id}/subscribed_apps
 */
export async function subscribeWABAWebhook(
  wabaId: string,
  accessToken: string
): Promise<boolean> {
  const url = `${META_GRAPH_API_BASE}/${wabaId}/subscribed_apps`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('Failed to subscribe WABA webhook:', error);
    return false;
  }

  const data = await response.json();
  return data.success === true;
}

/**
 * Fluxo completo de Embedded Signup:
 * 1. Troca code por token
 * 2. Resolve WABA ID e Business ID
 * 3. Busca números de telefone
 * 4. Registra webhook no WABA
 */
export async function processEmbeddedSignup(
  code: string,
  config: EmbeddedSignupConfig
): Promise<EmbeddedSignupResult> {
  console.log('🔄 [Embedded Signup] Iniciando processamento...');

  // 1. Exchange code for token
  console.log('🔑 [Embedded Signup] Trocando code por token...');
  const tokenResult = await exchangeCodeForToken(code, config);
  console.log('✅ [Embedded Signup] Token obtido');

  // 2. Resolve shared WABA
  console.log('🏢 [Embedded Signup] Resolvendo WABA ID...');
  const wabaInfo = await resolveSharedWABA(
    tokenResult.accessToken,
    config.appId,
    config.appSecret
  );
  console.log('✅ [Embedded Signup] WABA ID:', wabaInfo.wabaId, '| Business ID:', wabaInfo.businessId);

  // 3. Get phone numbers
  console.log('📱 [Embedded Signup] Buscando números de telefone...');
  const phoneNumbers = await getWABAPhoneNumbers(wabaInfo.wabaId, tokenResult.accessToken);
  if (phoneNumbers.length === 0) {
    throw new Error('Nenhum número de telefone encontrado no WABA. O cliente precisa registrar um número.');
  }
  const primaryPhone = phoneNumbers[0];
  console.log('✅ [Embedded Signup] Número:', primaryPhone.displayPhoneNumber, '| ID:', primaryPhone.phoneNumberId);

  // 4. Subscribe webhook
  console.log('🔔 [Embedded Signup] Registrando webhook no WABA...');
  const subscribed = await subscribeWABAWebhook(wabaInfo.wabaId, tokenResult.accessToken);
  console.log(subscribed ? '✅ [Embedded Signup] Webhook registrado' : '⚠️ [Embedded Signup] Webhook pode precisar de configuração manual');

  return {
    accessToken: tokenResult.accessToken,
    wabaId: wabaInfo.wabaId,
    businessId: wabaInfo.businessId,
    phoneNumberId: primaryPhone.phoneNumberId,
    displayPhoneNumber: primaryPhone.displayPhoneNumber,
    verifiedName: primaryPhone.verifiedName,
    qualityRating: primaryPhone.qualityRating,
  };
}
