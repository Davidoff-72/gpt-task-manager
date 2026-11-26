/* Pure state transitions, shared by worker and tests. */
(function(root) {
  const terminal = new Set(['COMPLETED', 'STOPPED', 'ERROR', 'RATE_LIMITED']);
  function transition(old, event, now, id) {
    const s = {...old};
    if (event.type === 'RESET') return {...s, conversation: event.conversation, status: 'UNKNOWN', taskId: null, startedAt: null, unread: false};
    if (event.type === 'SUSPEND') return {...s, status: 'SUSPENDED', taskId: null, startedAt: null};
    if (event.type === 'OBSERVE_ACTIVE') {
      if (s.status === 'PROCESSING' && s.taskId) return s;
      return {...s, status: 'PROCESSING', taskId: id, startedAt: now, completedAt: null, unread: false};
    }
    if (event.type === 'STOP') {
      if (s.status === 'PROCESSING' && s.taskId) return {...s, status: 'STOPPED', unread: false};
      return s;
    }
    if (event.type === 'FINISH') {
      if (s.status !== 'PROCESSING' || !s.taskId) return s;
      return {...s, status: 'COMPLETED', completedAt: now, unread: true};
    }
    if (event.type === 'ERROR' || event.type === 'RATE_LIMITED') {
      if (s.status === event.type) return s;
      return {...s, status: event.type, completedAt: now, unread: true};
    }
    if (event.type === 'UNCERTAIN' && !terminal.has(s.status)) return {...s, status: 'UNKNOWN', taskId: null, startedAt: null};
    if (event.type === 'IDLE' && !terminal.has(s.status) && s.status !== 'PROCESSING') return {...s, status: 'IDLE'};
    if (event.type === 'READ') return {...s, unread: false};
    return s;
  }
  root.TaskCore = {transition};
  if (typeof module !== 'undefined') module.exports = root.TaskCore;
})(globalThis);
