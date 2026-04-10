const { EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');

async function welcome(member) {
  const { guild, user } = member;

  // ── 1. Message dans le général ──────────────────────────────
  const welcomeChannel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle('🌿 Bienvenue dans Prairie !')
      .setDescription(
        `Hey ${user} ! Bienvenue sur le serveur de la famille Prairie 🎮\n\n` +
        `On est **7 clubs, 350+ membres actifs** — tous des vrais joueurs.\n` +
        `Commence par lire le <#${process.env.RULES_CHANNEL_ID}> et présente-toi !`
      )
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '📋 Étape 1', value: 'Lis les règles', inline: true },
        { name: '🏷️ Étape 2', value: 'Relie ton compte BS', inline: true },
        { name: '🏆 Étape 3', value: 'Rejoins un club', inline: true }
      )
      .setFooter({ text: 'Prairie Brawl Stars • Famille de clubs' })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed] });
  }

  // ── 2. MP de bienvenue ───────────────────────────────────────
  try {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#2ecc71')
          .setTitle('👋 Salut, bienvenue dans Prairie !')
          .setDescription(
            `🎮 **Lie ton compte Brawl Stars** avec \`/lier <tag>\`\n` +
            `📊 Tes stats s'afficheront dans ton profil Prairie\n` +
            `🌐 Retrouve toutes les infos sur notre site\n\n` +
            `Une question ? Ping le staff, on est là 💪`
          )
      ]
    });
  } catch {
    // MP bloqués, on ignore
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