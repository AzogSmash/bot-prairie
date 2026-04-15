// src/modules/welcome.js
const { AttachmentBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('./welcomeImage');

async function welcome(member) {
  const { guild, user } = member;

  // ── 1. Message dans le général ──────────────────────────────
  const welcomeChannel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const imageBuffer = await generateWelcomeImage(user, 'welcome');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

    await welcomeChannel.send({ 
      content: `Bienvenue ${user} ! Installe-toi et choisis tes rôles 🌿`,
      files: [attachment] 
    });
  }

  // ── 2. Enregistrement Supabase ───────────────────────────────
  const { error } = await supabase
    .from('members')
    .upsert({
      discord_id: user.id,
      discord_tag: user.tag,
      discord_username: user.username,
      avatar_url: user.displayAvatarURL(),
      joined_at: new Date().toISOString(),
      status: 'nouveau',
    }, { onConflict: 'discord_id' });

  if (error) console.error('[Supabase] Erreur upsert member:', error);
}

module.exports = { welcome };