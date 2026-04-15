const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { supabase } = require('../lib/supabase');
const { generateWelcomeImage } = require('./welcomeImage');

async function welcome(member) {
  const { guild, user } = member;

  const welcomeChannel = guild.channels.cache.get(process.env.WELCOME_CHANNEL_ID);
  if (welcomeChannel) {
    const imageBuffer = await generateWelcomeImage(user, 'welcome');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setDescription(
        `### 🌿 Une nouvelle pousse a rejoint la Prairie !\n\n` +
        `Hey ${user}, installe-toi et fais comme chez toi !\n\n` +
        `💬 **Viens te présenter** → <#1173550145955180618>\n` +
        `🎮 **Lie ton compte BS** → \`/lier #TAG\` dans <#1173729682546495589>\n` +
        `🎙️ **Passe en vocal** → On est toujours chauds pour jouer !`
      )
      .setImage('attachment://welcome.png')
      .setFooter({ text: 'Prairie Brawl Stars • Fais comme chez toi 🌿' })
      .setTimestamp();

    await welcomeChannel.send({ embeds: [embed], files: [attachment] });
  }

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