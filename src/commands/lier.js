const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getPlayer } = require('../lib/brawlapi');
const { supabase } = require('../lib/supabase');
const {
  getLinkedAccounts,
  addLinkedAccount,
  isBsTagAlreadyLinked,
  getAccountsSummary,
} = require('../lib/brawlAccounts');
const { CLUB_ROLES, getTrophyRole, updateMemberRoles } = require('../jobs/snapshots');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lier')
    .setDescription('Lie ton compte Brawl Stars à ton profil Prairie')
    .addStringOption(option =>
      option.setName('tag')
        .setDescription('Tag Brawl Stars (ex: 2ABC123)')
        .setRequired(true)
    )
    .addUserOption(option =>
      option.setName('membre')
        .setDescription('Staff : lier le compte d\'un autre membre')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const tag = interaction.options.getString('tag');
    const targetUser = interaction.options.getUser('membre');
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

    if (targetUser && !isStaff) {
      return interaction.editReply({
        content: '❌ Seul le staff peut lier le compte d\'un autre membre.',
      });
    }

    const user = targetUser || interaction.user;
    const member = targetUser
      ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
      : interaction.member;

    if (!member) {
      return interaction.editReply({ content: '❌ Membre introuvable sur le serveur.' });
    }

    try {
      const player = await getPlayer(tag);

      const alreadyLinkedElsewhere = await isBsTagAlreadyLinked(player.tag, user.id);
      if (alreadyLinkedElsewhere) {
        return interaction.editReply({
          content: `❌ Ce compte Brawl Stars est déjà lié à un autre membre du serveur.`,
        });
      }

      const existingAccounts = await getLinkedAccounts(user.id);
      const alreadyLinkedToUser = existingAccounts.some(acc => acc.bs_tag === player.tag);

      if (alreadyLinkedToUser) {
        return interaction.editReply({
          content: `ℹ️ Ce compte est déjà lié à ce profil.`,
        });
      }

      if (existingAccounts.length >= 5) {
        return interaction.editReply({
          content: `❌ ${targetUser ? 'Ce membre a' : 'Tu as'} déjà atteint la limite de 5 comptes liés.`,
        });
      }

      const { data: existingMember, error: existingMemberError } = await supabase
        .from('members')
        .select('discord_id, status')
        .eq('discord_id', user.id)
        .maybeSingle();

      if (existingMemberError) throw existingMemberError;

      const memberPayload = {
        discord_id: user.id,
        discord_tag: user.tag,
        discord_username: member.displayName,
        avatar_url: user.displayAvatarURL(),
      };

      if (!existingMember) {
        memberPayload.status = 'nouveau';
      }

      const { error: upsertMemberError } = await supabase
        .from('members')
        .upsert(memberPayload, { onConflict: 'discord_id' });

      if (upsertMemberError) throw upsertMemberError;

      const isFirstAccount = existingAccounts.length === 0;

      await addLinkedAccount(user.id, player.tag, player.name, isFirstAccount);

      const allAccounts = await getLinkedAccounts(user.id);
      const summaryMap = new Map();

      for (const acc of allAccounts) {
        const accPlayer = await getPlayer(acc.bs_tag);
        summaryMap.set(acc.bs_tag, {
          trophies: accPlayer.trophies,
          clubName: accPlayer.club?.name || null,
          bsName: accPlayer.name,
        });
      }

      const summary = await getAccountsSummary(user.id, summaryMap);

      await supabase
        .from('members')
        .update({
          brawlstars_trophies: summary.bestTrophies,
          club_name: summary.mainAccount?.clubName || null,
        })
        .eq('discord_id', user.id);

      await updateMemberRoles(member, summary.clubNames, summary.bestTrophies);

      const trophyTier = getTrophyRole(summary.bestTrophies);
      const clubRolesDisplay = summary.clubNames.length
        ? summary.clubNames
            .map(name => CLUB_ROLES[name] ? `<@&${CLUB_ROLES[name]}>` : name)
            .join('\n')
        : 'Aucun club Prairie';

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(
          targetUser
            ? `✅ Compte lié pour ${user.username} !`
            : isFirstAccount
              ? '✅ Compte principal lié avec succès !'
              : '✅ Compte secondaire ajouté avec succès !'
        )
        .setDescription(
          targetUser
            ? `Le compte Brawl Stars de **${user.username}** a été lié par le staff.`
            : isFirstAccount
              ? `Ton compte Brawl Stars principal est maintenant lié à ton profil Prairie.`
              : `Ton compte Brawl Stars a bien été ajouté à tes profils liés.\nUtilise \`/settings\` pour gérer ton compte principal.`
        )
        .addFields(
          { name: '🎮 Joueur', value: player.name, inline: true },
          { name: '🏆 Trophées', value: player.trophies.toLocaleString('fr-FR'), inline: true },
          { name: '🌿 Club', value: player.club?.name || 'Sans club', inline: true },
        )
        .addFields(
          { name: '👑 Compte principal', value: summary.mainTag || player.tag, inline: true },
          { name: '📚 Comptes liés', value: `${summary.accounts.length}/5`, inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
        )
        .addFields(
          { name: '🏷️ Rôles Prairie', value: `${clubRolesDisplay}\n<@&${trophyTier.roleId}>`, inline: false },
        )
        .setFooter({ text: targetUser ? `Lié par ${interaction.user.username}` : 'Prairie Brawl Stars' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Log staff
      if (targetUser) {
        const staffChannel = interaction.guild.channels.cache.get(process.env.STAFF_CHANNEL_ID);
        if (staffChannel) {
          await staffChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#9b59b6')
                .setTitle('🔗 Compte lié par le staff')
                .addFields(
                  { name: '👤 Membre', value: `${user}`, inline: true },
                  { name: '🎮 Tag BS', value: player.tag, inline: true },
                  { name: '🛡️ Staff', value: `${interaction.user}`, inline: true },
                )
                .setTimestamp()
            ]
          });
        }
      }

    } catch (err) {
      console.error('[Lier]', err);
      await interaction.editReply({
        content: `❌ Tag introuvable ou invalide. Vérifie ton tag et réessaie.\nExemple : \`/lier #2ABC123\``,
      });
    }
  },
};