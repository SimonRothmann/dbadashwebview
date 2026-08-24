import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, X, Tag, ChevronDown, ChevronRight, Loader2, Lock } from 'lucide-react';
import { api } from '../api/api';
import type { InstanceListRow, TagRow } from '../api/types';

interface Group { id: number; name: string; description: string; members: string[] }

function loadGroups(): Group[] {
  try { return JSON.parse(localStorage.getItem('config_groups') || '[]'); } catch { return []; }
}
function saveGroups(g: Group[]) { localStorage.setItem('config_groups', JSON.stringify(g)); }

function instanceLabel(instance: InstanceListRow | undefined, instanceId: number): string {
  return instance?.InstanceDisplayName || instance?.Instance || `Instance #${instanceId}`;
}

function tagLabel(tag: TagRow): string {
  const name = tag.isSystem ? tag.tagName.replace(/^\{|\}$/g, '') : tag.tagName;
  return tag.tagValue ? `${name}: ${tag.tagValue}` : name;
}

export default function ConfigGroupsPage() {
  const [groups, setGroups] = useState<Group[]>(loadGroups);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  useEffect(() => { saveGroups(groups); }, [groups]);

  const [tags, setTags] = useState<TagRow[]>([]);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [expandedTagId, setExpandedTagId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadTagData(); }, []);

  async function loadTagData() {
    setTagsLoading(true);
    try {
      const [tagList, instanceList] = await Promise.all([api.tags(), api.instances()]);
      setTags(Array.isArray(tagList) ? tagList : []);
      setInstances(Array.isArray(instanceList) ? instanceList : []);
      setError(null);
    } catch {
      // /api/tags answers with problem details rather than an error string, so
      // there is nothing server-supplied worth showing the user here.
      setTags([]);
      setError('Unable to load tags.');
    } finally {
      setTagsLoading(false);
    }
  }

  const instanceById = useMemo(() => {
    const map = new Map<number, InstanceListRow>();
    for (const instance of instances) map.set(instance.InstanceID, instance);
    return map;
  }, [instances]);

  const systemTags = useMemo(() => tags.filter(t => t.isSystem), [tags]);
  const customTags = useMemo(() => tags.filter(t => !t.isSystem), [tags]);





  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Groups & Tags</h1>

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Groups</h3>
          <button onClick={() => setShowAddGroup(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors">
            <Plus className="w-4 h-4" /> Create Group
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-300 font-semibold">Name</th>
              <th className="pb-3 text-gray-300 font-semibold">Description</th>
              <th className="pb-3 text-gray-300 font-semibold text-right">Members</th>
              <th className="pb-3 text-gray-300 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id} className="border-b border-white/5">
                <td className="py-3 text-white font-medium">{g.name}</td>
                <td className="py-3 text-gray-400 text-xs">{g.description}</td>
                <td className="py-3 text-gray-300 text-right">{g.members.length}</td>
                <td className="py-3 text-center">
                  <button onClick={() => setGroups(prev => prev.filter(x => x.id !== g.id))} className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {groups.length === 0 && <p className="text-gray-500 text-sm py-3 text-center">No groups defined.</p>}
      </div>

      {showAddGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddGroup(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Create Group</h3>
              <button onClick={() => setShowAddGroup(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Group Name" value={newGroup.name} onChange={e => setNewGroup(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Description" value={newGroup.description} onChange={e => setNewGroup(p => ({ ...p, description: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm" />
              <button onClick={() => {
                if (newGroup.name) {
                  setGroups(prev => [...prev, { id: Date.now(), ...newGroup, members: [] }]);
                  setNewGroup({ name: '', description: '' });
                  setShowAddGroup(false);
                }
              }} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Tag className="w-5 h-5 text-purple-400" /> Tags</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Read from DBA Dash's own tag tables — <code>dbo.InstanceIDsTags</code> plus the
          Azure SQL server-level tags in <code>dbo.InstanceTags</code>, which are shown as{' '}
          <em>inherited</em>. Shared across all users and maintained in DBA Dash itself.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
        )}

        {tagsLoading ? (
          <div className="flex items-center gap-2 text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading tags...
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Custom Tags</h4>
              <div className="space-y-2">
                {customTags.map(tag => (
                  <div key={tag.tagId} className="rounded-lg border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center justify-between px-3 py-2">
                      <button
                        onClick={() => setExpandedTagId(prev => (prev === tag.tagId ? null : tag.tagId))}
                        className="flex items-center gap-2 text-sm text-white hover:text-purple-300 transition-colors"
                      >
                        {expandedTagId === tag.tagId ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        <span className="px-2.5 py-1 bg-purple-500/10 text-purple-400 rounded-full">{tagLabel(tag)}</span>
                        <span className="text-gray-500 text-xs">{tag.instanceIds.length} instance{tag.instanceIds.length === 1 ? '' : 's'}</span>
                      </button>
                    </div>
                    {expandedTagId === tag.tagId && (
                      <div className="px-3 pb-3 flex flex-wrap gap-2">
                        {tag.instanceIds.map(instanceId => (
                          <span
                            key={instanceId}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 text-gray-300 rounded-full text-xs"
                          >
                            {instanceLabel(instanceById.get(instanceId), instanceId)}
                            {tag.inheritedInstanceIds.includes(instanceId) && (
                              <span className="text-[10px] uppercase tracking-wide text-gray-500" title="Inherited from an Azure SQL server-level tag">
                                inherited
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {customTags.length === 0 && <p className="text-gray-500 text-sm py-2">No custom tags defined yet.</p>}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gray-500" /> System Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {systemTags.map(tag => (
                  <span key={tag.tagId} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-gray-400 rounded-full text-sm" title={`${tag.instanceIds.length} instance(s)`}>
                    {tagLabel(tag)}
                    <span className="text-gray-600 text-xs">({tag.instanceIds.length})</span>
                  </span>
                ))}
                {systemTags.length === 0 && <span className="text-gray-500 text-sm">No system tags collected yet.</span>}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
