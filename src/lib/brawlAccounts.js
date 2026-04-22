const { supabase } = require('./supabase');

function normalizeBsTag(tag) {
  const raw = String(tag || '').toUpperCase().replace(/^#*/, '').trim();
  return raw ? `#${raw}` : null;
}

async function getLinkedAccounts(discordId) {
  const { data, error } = await supabase
    .from('member_brawl_accounts')
    .select('id, discord_id, bs_tag, bs_name, is_main, created_at, updated_at')
    .eq('discord_id', discordId)
    .order('is_main', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getMainAccount(discordId) {
  const { data, error } = await supabase
    .from('member_brawl_accounts')
    .select('id, discord_id, bs_tag, bs_name, is_main, created_at, updated_at')
    .eq('discord_id', discordId)
    .eq('is_main', true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function addLinkedAccount(discordId, bsTag, bsName = null, isMain = false) {
  const normalizedTag = normalizeBsTag(bsTag);
  if (!normalizedTag) {
    throw new Error('Tag Brawl Stars invalide.');
  }

  if (isMain) {
    await supabase
      .from('member_brawl_accounts')
      .update({ is_main: false })
      .eq('discord_id', discordId);
  }

  const { data, error } = await supabase
    .from('member_brawl_accounts')
    .insert({
      discord_id: discordId,
      bs_tag: normalizedTag,
      bs_name: bsName,
      is_main: isMain,
    })
    .select()
    .single();

  if (error) throw error;

  if (isMain) {
    await refreshMemberMainSnapshot(discordId);
  }

  return data;
}

async function setMainAccount(discordId, bsTag) {
  const normalizedTag = normalizeBsTag(bsTag);
  if (!normalizedTag) {
    throw new Error('Tag Brawl Stars invalide.');
  }

  const accounts = await getLinkedAccounts(discordId);
  const exists = accounts.some(acc => acc.bs_tag === normalizedTag);

  if (!exists) {
    throw new Error('Ce compte n’est pas lié à cet utilisateur.');
  }

  const { error: resetError } = await supabase
    .from('member_brawl_accounts')
    .update({ is_main: false })
    .eq('discord_id', discordId);

  if (resetError) throw resetError;

  const { data, error } = await supabase
    .from('member_brawl_accounts')
    .update({ is_main: true, updated_at: new Date().toISOString() })
    .eq('discord_id', discordId)
    .eq('bs_tag', normalizedTag)
    .select()
    .single();

  if (error) throw error;

  await refreshMemberMainSnapshot(discordId);

  return data;
}

async function removeLinkedAccount(discordId, bsTag) {
  const normalizedTag = normalizeBsTag(bsTag);
  if (!normalizedTag) {
    throw new Error('Tag Brawl Stars invalide.');
  }

  const accounts = await getLinkedAccounts(discordId);
  const target = accounts.find(acc => acc.bs_tag === normalizedTag);

  if (!target) {
    throw new Error('Ce compte n’est pas lié à cet utilisateur.');
  }

  const wasMain = target.is_main;

  const { error } = await supabase
    .from('member_brawl_accounts')
    .delete()
    .eq('discord_id', discordId)
    .eq('bs_tag', normalizedTag);

  if (error) throw error;

  if (wasMain) {
    const remaining = await getLinkedAccounts(discordId);
    if (remaining.length > 0) {
      await setMainAccount(discordId, remaining[0].bs_tag);
    } else {
      await refreshMemberMainSnapshot(discordId);
    }
  } else {
    await refreshMemberMainSnapshot(discordId);
  }

  return true;
}

async function refreshMemberMainSnapshot(discordId, snapshot = {}) {
  const mainAccount = await getMainAccount(discordId);

  if (!mainAccount) {
    const { error } = await supabase
      .from('members')
      .update({
        brawlstars_tag: null,
        brawlstars_trophies: null,
        club_name: null,
      })
      .eq('discord_id', discordId);

    if (error) throw error;
    return null;
  }

  const updatePayload = {
    brawlstars_tag: mainAccount.bs_tag,
  };

  if ('brawlstars_trophies' in snapshot) {
    updatePayload.brawlstars_trophies = snapshot.brawlstars_trophies;
  }

  if ('club_name' in snapshot) {
    updatePayload.club_name = snapshot.club_name;
  }

  const { error } = await supabase
    .from('members')
    .update(updatePayload)
    .eq('discord_id', discordId);

  if (error) throw error;

  return updatePayload;
}

async function getPreferredBsTag(discordId) {
  const mainAccount = await getMainAccount(discordId);
  if (mainAccount?.bs_tag) {
    return mainAccount.bs_tag;
  }

  const { data, error } = await supabase
    .from('members')
    .select('brawlstars_tag')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (error) throw error;
  return data?.brawlstars_tag || null;
}

async function getAccountsSummary(discordId, currentTrophiesMap = new Map()) {
  const accounts = await getLinkedAccounts(discordId);

  if (!accounts.length) {
    return {
      accounts: [],
      bestTrophies: 0,
      clubNames: [],
      mainTag: null,
      mainAccount: null,
    };
  }

  const enrichedAccounts = accounts.map(account => {
    const currentData = currentTrophiesMap.get(account.bs_tag) || null;
    return {
      ...account,
      currentData,
      trophies: currentData?.trophies ?? 0,
      clubName: currentData?.clubName ?? null,
      bsName: currentData?.bsName ?? account.bs_name ?? null,
    };
  });

  const bestTrophies = Math.max(0, ...enrichedAccounts.map(a => a.trophies || 0));
  const clubNames = [...new Set(
    enrichedAccounts
      .map(a => a.clubName)
      .filter(Boolean)
  )];

  const mainAccount = enrichedAccounts.find(a => a.is_main) || null;

  return {
    accounts: enrichedAccounts,
    bestTrophies,
    clubNames,
    mainTag: mainAccount?.bs_tag || null,
    mainAccount,
  };
}

async function isBsTagAlreadyLinked(bsTag, exceptDiscordId = null) {
    const normalizedTag = normalizeBsTag(bsTag);
    if (!normalizedTag) return false;

    let query = supabase
      .from('member_brawl_accounts')
      .select('discord_id, bs_tag')
      .eq('bs_tag', normalizedTag);

    if (exceptDiscordId) {
      query = query.neq('discord_id', exceptDiscordId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    return !!data;
}

module.exports = {
  normalizeBsTag,
  getLinkedAccounts,
  getMainAccount,
  addLinkedAccount,
  setMainAccount,
  removeLinkedAccount,
  refreshMemberMainSnapshot,
  getPreferredBsTag,
  getAccountsSummary,
  isBsTagAlreadyLinked,
};