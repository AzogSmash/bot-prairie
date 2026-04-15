const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

async function welcome(member) {
  const { guild, user } = member;

  // ── 1. Message dans le général ──────────────────────────────
  const welcomeChannel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Bienvenue dans la Prairie !')
      .setDescription(
        `Hey ${user} ! Installe-toi, t'es chez toi maintenant 🏡\n\n` +
        `💬 Viens te présenter dans <#1173550145955180618>\n\n` +
        `🔗 Lie ton compte BS dans <#1173729682546495589> avec \`/lier #TAG\` pour profiter du bot Prairie\n\n` +
        `🎙️ Passe nous voir en vocal, on sera ravis de discuter avec toi !`
      )
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'Prairie Brawl Stars • Fais comme chez toi 🌿' })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed] });
  }

  // ── 3. Enregistrement Supabase ───────────────────────────────
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