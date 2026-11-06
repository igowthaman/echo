'use server';

import { getCurrentUser } from '@/lib/auth/current-user';
import { contactIdsOf } from '@/lib/contacts';
import {
  MAX_GROUP_MEMBERS,
  addMembers,
  countMembers,
  createGroup,
  getRole,
  groupNameProblem,
  leaveGroup,
  listGroups,
  removeMember,
  renameGroup,
  setRole,
  type Group,
} from '@/lib/groups';
import { isUserId } from '@/lib/users';

/** Every action returns the caller's updated groups, or an error to show. */
export type GroupResult = { error?: string; groups?: Group[]; groupId?: string };

const SIGNED_OUT: GroupResult = { error: 'Your session has ended. Log in again.' };
const uniqueIds = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter(isUserId))] : []);

export async function createGroupAction(rawName: string, memberIds: string[]): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const name = String(rawName ?? '').trim();
  const nameProblem = groupNameProblem(name);
  if (nameProblem) return { error: nameProblem };

  const members = uniqueIds(memberIds).filter((id) => id !== me.id);
  if (members.length === 0) return { error: 'Add at least one person.' };
  if (members.length + 1 > MAX_GROUP_MEMBERS) return { error: `A group can have up to ${MAX_GROUP_MEMBERS} people.` };
  const contacts = contactIdsOf(me.id);
  if (members.some((id) => !contacts.has(id))) return { error: 'You can only add people from your contacts.' };

  const groupId = createGroup(me.id, name, members);
  return { groupId, groups: listGroups(me.id) };
}

export async function addGroupMembersAction(groupId: string, memberIds: string[]): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const role = isUserId(groupId) ? getRole(groupId, me.id) : null;
  if (role !== 'owner' && role !== 'admin') return { error: 'Only the owner and admins can add people.' };

  const newMembers = uniqueIds(memberIds).filter((id) => id !== me.id && !getRole(groupId, id));
  if (newMembers.length === 0) return { error: 'Choose someone who isn’t in the group yet.' };
  const contacts = contactIdsOf(me.id);
  if (newMembers.some((id) => !contacts.has(id))) return { error: 'You can only add people from your contacts.' };
  if (countMembers(groupId) + newMembers.length > MAX_GROUP_MEMBERS) {
    return { error: `A group can have up to ${MAX_GROUP_MEMBERS} people.` };
  }

  addMembers(groupId, newMembers);
  return { groups: listGroups(me.id) };
}

export async function removeGroupMemberAction(groupId: string, userId: string): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  if (!isUserId(groupId) || !isUserId(userId)) return { error: 'That person isn’t in this group.' };
  if (userId === me.id) return { error: 'Use Leave group to leave.' };

  const myRole = getRole(groupId, me.id);
  const theirRole = getRole(groupId, userId);
  if (!theirRole) return { error: 'That person isn’t in this group.' };
  // The owner can remove anyone; admins can remove ordinary members.
  const allowed = myRole === 'owner' || (myRole === 'admin' && theirRole === 'member');
  if (!allowed) return { error: 'You don’t have permission to remove them.' };

  removeMember(groupId, userId);
  return { groups: listGroups(me.id) };
}

export async function renameGroupAction(groupId: string, rawName: string): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  const role = isUserId(groupId) ? getRole(groupId, me.id) : null;
  if (role !== 'owner' && role !== 'admin') return { error: 'Only the owner and admins can rename the group.' };
  const name = String(rawName ?? '').trim();
  const nameProblem = groupNameProblem(name);
  if (nameProblem) return { error: nameProblem };

  renameGroup(groupId, name);
  return { groups: listGroups(me.id) };
}

/** The owner decides who else may manage the group. */
export async function setGroupAdminAction(groupId: string, userId: string, admin: boolean): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  if (!isUserId(groupId) || !isUserId(userId)) return { error: 'That person isn’t in this group.' };
  if (getRole(groupId, me.id) !== 'owner') return { error: 'Only the group’s owner can change who is an admin.' };
  const theirRole = getRole(groupId, userId);
  if (!theirRole || theirRole === 'owner') return { error: 'That person isn’t a member you can change.' };

  setRole(groupId, userId, admin ? 'admin' : 'member');
  return { groups: listGroups(me.id) };
}

export async function leaveGroupAction(groupId: string): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return SIGNED_OUT;
  if (!isUserId(groupId) || !getRole(groupId, me.id)) return { error: 'You’re not in this group.' };
  leaveGroup(groupId, me.id);
  return { groups: listGroups(me.id) };
}
