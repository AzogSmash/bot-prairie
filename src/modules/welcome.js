const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

async function welcome(member) {
  const { guild, user } = member;

  // ── 1. Message dans le général ──────────────────────────────
  const welcomeChannel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setAuthor({ 
        name: `${user.username} vient d'arriver !`, 
        iconURL: user.displayAvatarURL({ dynamic: true }) 
      })
      .setDescription(
        `Bienvenue ${user} dans la famille Prairie 🌿\n\n` +
        `Installe-toi et n'hésite pas à venir discuter avec nous !\n` +
        `On espère que t'as bien choisi tes rôles 👀`
      )
      .addFields(
        { name: '💬 Général', value: `<#1173550145955180618>`, inline: true },
        { name: '🔗 Lier ton compte', value: `<#1173729682546495589>`, inline: true },
        { name: '🎙️ Vocal', value: `On t'attend !`, inline: true },
      )
      .setFooter({ text: 'Prairie Brawl Stars' })
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