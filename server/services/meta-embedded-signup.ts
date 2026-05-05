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
 * Estratégia com múltiplos fallbacks:
 * 1. debug_token -> granular_scopes -> whatsapp_business_management -> target_ids
 * 2. /me/businesses -> whatsapp_business_accounts (businesses do usuário com WABAs)
 * 3. /{business-id}/owned_whatsapp_business_accounts (WABAs de cada business)
 * 4. /{business-id}/client_whatsapp_business_accounts (WABAs compartilhados com Tech Provider)
 */
export async function resolveSharedWABA(
  userToken: string,
  appId: string,
  appSecret: string
): Promise<SharedWABAInfo> {
  const appToken = `${appId}|${appSecret}`;

  let wabaId: string | null = null;
  let businessId: string | null = null;

  // ─── Step 1: debug_token → granular_scopes ───────────────────────────────
  try {
    const debugData = await debugToken(userToken, appToken);
    console.log('🔍 [WABA] debug_token granular_scopes:', JSON.stringify(debugData?.granular_scopes || []));

    if (debugData?.granular_scopes) {
      for (const scope of debugData.granular_scopes) {
        if (
          (scope.permission === 'whatsapp_business_management' ||
           scope.permission === 'whatsapp_business_messaging') &&
          scope.target_ids?.length > 0
        ) {
          wabaId = wabaId || scope.target_ids[0];
        }
        if (scope.permission === 'business_management' && scope.target_ids?.length > 0) {
          businessId = businessId || scope.target_ids[0];
        }
      }
    }
    console.log('🔍 [WABA] Após debug_token: wabaId=', wabaId, 'businessId=', businessId);
  } catch (err) {
    console.warn('⚠️ [WABA] debug_token falhou:', err);
  }

  // ─── Step 2: /me/businesses com WABAs expandidos ─────────────────────────
  if (!wabaId) {
    try {
      const bizUrl = `${META_GRAPH_API_BASE}/me/businesses?fields=id,name,whatsapp_business_accounts{id,name,currency,timezone_id}`;
      const bizResp = await fetch(bizUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (bizResp.ok) {
        const bizData = await bizResp.json();
        console.log('🔍 [WABA] /me/businesses:', JSON.stringify(bizData?.data?.map((b: any) => ({
          id: b.id,
          name: b.name,
          wabas: b.whatsapp_business_accounts?.data?.map((w: any) => w.id),
        })) || []));

        for (const biz of bizData?.data || []) {
          businessId = businessId || biz.id;
          if (biz.whatsapp_business_accounts?.data?.length > 0) {
            wabaId = biz.whatsapp_business_accounts.data[0].id;
            businessId = biz.id;
            break;
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ [WABA] /me/businesses falhou:', err);
    }
  }

  // ─── Step 3: /{business-id}/owned_whatsapp_business_accounts ─────────────
  if (!wabaId && businessId) {
    try {
      const ownedUrl = `${META_GRAPH_API_BASE}/${businessId}/owned_whatsapp_business_accounts?fields=id,name`;
      const ownedResp = await fetch(ownedUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (ownedResp.ok) {
        const ownedData = await ownedResp.json();
        console.log('🔍 [WABA] owned_whatsapp_business_accounts:', JSON.stringify(ownedData?.data));
        if (ownedData?.data?.length > 0) {
          wabaId = ownedData.data[0].id;
        }
      }
    } catch (err) {
      console.warn('⚠️ [WABA] owned_whatsapp_business_accounts falhou:', err);
    }
  }

  // ─── Step 4: /{business-id}/client_whatsapp_business_accounts ────────────
  if (!wabaId && businessId) {
    try {
      const clientUrl = `${META_GRAPH_API_BASE}/${businessId}/client_whatsapp_business_accounts?fields=id,name`;
      const clientResp = await fetch(clientUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (clientResp.ok) {
        const clientData = await clientResp.json();
        console.log('🔍 [WABA] client_whatsapp_business_accounts:', JSON.stringify(clientData?.data));
        if (clientData?.data?.length > 0) {
          wabaId = clientData.data[0].id;
        }
      }
    } catch (err) {
      console.warn('⚠️ [WABA] client_whatsapp_business_accounts falhou:', err);
    }
  }

  // ─── Step 5: /me → user ID como fallback de businessId ──────────────────
  if (!wabaId && !businessId) {
    try {
      const meResp = await fetch(`${META_GRAPH_API_BASE}/me?fields=id,name`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (meResp.ok) {
        const meData = await meResp.json();
        console.log('🔍 [WABA] /me:', JSON.stringify(meData));
        businessId = meData.id;
      }
    } catch (err) {
      console.warn('⚠️ [WABA] /me falhou:', err);
    }
  }

  if (!wabaId) {
    throw new Error(
      'Não foi possível encontrar o WABA ID. Verifique se o cliente compartilhou a conta WhatsApp Business corretamente.'
    );
  }

  // ─── Resolve businessId via WABA details se ainda não temos ──────────────
  if (!businessId) {
    try {
      const wabaDetailsUrl = `${META_GRAPH_API_BASE}/${wabaId}?fields=id,owner_business_info`;
      const detailsResp = await fetch(wabaDetailsUrl, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (detailsResp.ok) {
        const details = await detailsResp.json();
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
