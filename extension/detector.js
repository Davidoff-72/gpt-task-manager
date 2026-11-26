/* Conservative evidence model. Inputs are UI facts only, never conversation text. */
(function (root) {
  const STABLE_MS = 10000, SUBMISSION_WINDOW_MS = 120000;
  function initial() { return {phase:'unknown', submitted:false, submittedAt:null, changed:false, candidateAt:null}; }
  function step(previous, signal, now) {
    const s = {...previous}; const events = [];
    if (signal.reset) return {state:initial(), events:['RESET']};
    if (signal.submitted && s.phase !== 'active' && s.phase !== 'candidate') { s.submitted = true; s.submittedAt=now; s.phase = 'submitted'; events.push('SUBMIT'); }
    if (s.phase === 'submitted' && now-s.submittedAt > SUBMISSION_WINDOW_MS) { s.phase='unknown'; s.submitted=false; events.push('UNCERTAIN'); return {state:s,events}; }
    if (signal.stopRequested && (s.phase === 'active' || s.phase === 'candidate')) {
      s.phase='terminal'; s.submitted=false; s.candidateAt=null; return {state:s,events:['STOP']};
    }
    if (signal.error) { if (s.phase !== signal.error) events.push(signal.error); s.phase=signal.error; s.submitted=false; s.candidateAt=null; return {state:s,events}; }
    if (signal.stopVisible) {
      if ((s.phase === 'active' || s.phase === 'candidate') && (signal.assistantChanged || signal.newAssistant)) s.changed=true;
      if (s.phase === 'submitted' && s.submitted) { s.phase='active'; s.changed=!!signal.newAssistant; s.candidateAt=null; events.push('OBSERVE_ACTIVE'); }
      else if (s.phase === 'candidate') { s.phase='active'; s.candidateAt=null; }
      return {state:s,events};
    }
    if (s.phase === 'active' || s.phase === 'candidate') {
      if (signal.assistantChanged || signal.newAssistant) s.changed=true;
      const enough = s.changed && signal.composerReady && signal.finalControl && !signal.toolBusy;
      if (!enough || signal.assistantChanged) { s.candidateAt=null; s.phase='active'; }
      else if (s.candidateAt === null) { s.candidateAt=now; s.phase='candidate'; }
      else if (now-s.candidateAt >= STABLE_MS) { s.phase='terminal'; s.submitted=false; s.candidateAt=null; events.push('FINISH'); }
      return {state:s,events};
    }
    if (s.phase === 'unknown' && signal.composerReady) { s.phase='idle'; events.push('IDLE'); }
    return {state:s,events};
  }
  root.GptDetector = {initial,step,STABLE_MS,SUBMISSION_WINDOW_MS};
  if (typeof module !== 'undefined') module.exports = root.GptDetector;
})(globalThis);
