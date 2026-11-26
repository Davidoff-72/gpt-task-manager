/* Pure state transitions, shared by worker and tests. */
(function(root) {
  const terminal = new Set(['COMPLETED', 'STOPPED', 'ERROR', 'RATE_LIMITED']);
  const stableConversation = path => /^\/c\/[a-zA-Z0-9-]{1,120}$/.test(path || '');
  const SUBMISSION_WINDOW_MS = 120000;
  function transition(old, event, now, id) {
    const s = {...old};
    if (event.type === 'RESET') {
      if (s.status === 'COMPLETED' && s.conversation === event.conversation && stableConversation(event.conversation)) return {...s, pendingSubmit:false, submittedAt:null, monitoringSuspended:false};
      return {...s, conversation:event.conversation, status:'UNKNOWN', taskId:null, startedAt:null, completedAt:null, unread:false, pendingSubmit:false, submittedAt:null, monitoringSuspended:false, deferredAlert:null};
    }
    if (event.type === 'SUSPEND') {
      if (s.status === 'COMPLETED' && !event.routeChanged) return {...s, pendingSubmit:false, submittedAt:null, monitoringSuspended:true};
      return {...s, status:'SUSPENDED', taskId:null, startedAt:null, pendingSubmit:false, submittedAt:null, monitoringSuspended:true};
    }
    // A click/Enter is only an intent, not proof of a generation or completion.
    if (event.type === 'SUBMIT') {
      if (s.status === 'PROCESSING') return s;
      return {...s, status:s.status === 'COMPLETED' ? 'COMPLETED' : 'UNKNOWN', pendingSubmit:true, submittedAt:now};
    }
    if (event.type === 'OBSERVE_ACTIVE') {
      if (s.status === 'PROCESSING' && s.taskId) return s;
      if (!s.pendingSubmit || !Number.isFinite(s.submittedAt) || now-s.submittedAt < 0 || now-s.submittedAt > SUBMISSION_WINDOW_MS) return s;
      return {...s, status:'PROCESSING', taskId:id, startedAt:now, completedAt:null, unread:false, pendingSubmit:false, submittedAt:null, monitoringSuspended:false, deferredAlert:null};
    }
    if (event.type === 'STOP') {
      if (s.status === 'PROCESSING' && s.taskId) return {...s, status:'STOPPED', unread:false, pendingSubmit:false, submittedAt:null};
      return s;
    }
    if (event.type === 'FINISH') {
      if (s.status !== 'PROCESSING' || !s.taskId) return s;
      return {...s, status:'COMPLETED', completedAt:now, unread:true, pendingSubmit:false, submittedAt:null};
    }
    if (event.type === 'ERROR' || event.type === 'RATE_LIMITED') {
      if (s.status === 'COMPLETED' && s.unread && !s.pendingSubmit) return s.deferredAlert===event.type ? s : {...s,deferredAlert:event.type};
      if (s.status === event.type) return s;
      return {...s, status:event.type, completedAt:now, unread:true, pendingSubmit:false, submittedAt:null, deferredAlert:null, ...(s.status==='COMPLETED' ? {taskId:null,startedAt:null} : {})};
    }
    if (event.type === 'UNCERTAIN' && terminal.has(s.status) && s.pendingSubmit) return {...s, pendingSubmit:false, submittedAt:null};
    if (event.type === 'UNCERTAIN' && !terminal.has(s.status)) return {...s, status:'UNKNOWN', taskId:null, startedAt:null, pendingSubmit:false, submittedAt:null};
    if (event.type === 'IDLE' && !terminal.has(s.status) && s.status !== 'PROCESSING' && !s.pendingSubmit) return {...s, status:'IDLE'};
    if (event.type === 'READ') return {...s, unread:false};
    return s;
  }
  function reason(old, event, next) {
    switch(event.type) {
      case 'RESET': return old.status==='COMPLETED' && next.status==='COMPLETED' ? 'SAME_CONVERSATION_COMPLETION_PRESERVED' : 'ROUTE_OR_DOCUMENT_RESET';
      case 'SUSPEND': return next.status==='COMPLETED' ? 'COMPLETION_PRESERVED_WHILE_SUSPENDED' : 'DETECTION_SUSPENDED';
      case 'SUBMIT': return old.status==='PROCESSING' ? 'ALREADY_PROCESSING' : 'SUBMISSION_INTENT_AWAITING_START';
      case 'OBSERVE_ACTIVE': return next.status==='PROCESSING' && old.status!=='PROCESSING' ? 'SUBMISSION_AND_STOP_OBSERVED' : old.status==='PROCESSING' ? 'ALREADY_PROCESSING' : 'SUBMISSION_NOT_CONFIRMED_OR_EXPIRED';
      case 'FINISH': return old.status==='PROCESSING' && next.status==='COMPLETED' ? 'STABLE_FINAL_EVIDENCE' : old.status==='COMPLETED' ? 'DUPLICATE_FINISH_IGNORED' : 'NO_ACTIVE_TASK';
      case 'IDLE': return old.status==='COMPLETED' ? 'COMPLETION_PRESERVED' : old.pendingSubmit ? 'START_UNCONFIRMED' : 'COMPOSER_READY';
      case 'READ': return 'USER_VIEWED';
      case 'UNCERTAIN': return 'INSUFFICIENT_EVIDENCE';
      case 'STOP': return old.status==='PROCESSING' ? 'USER_STOP' : 'NO_ACTIVE_TASK';
      case 'ERROR': return next.status==='COMPLETED' ? 'UNREAD_COMPLETION_PRESERVED' : 'EXPLICIT_ERROR';
      case 'RATE_LIMITED': return next.status==='COMPLETED' ? 'UNREAD_COMPLETION_PRESERVED' : 'EXPLICIT_RATE_LIMIT';
      case 'MIGRATE': return 'SAME_DOCUMENT_NEW_CHAT';
      default: return 'UNKNOWN_EVENT';
    }
  }
  root.TaskCore = {transition,reason,SUBMISSION_WINDOW_MS};
  if (typeof module !== 'undefined') module.exports = root.TaskCore;
})(globalThis);
