/**
 * Command parsing and dispatch helpers
 */
/**
 * parseRawCommand - Inspired by ATC-SIM, this parser handles chained commands
 * and context-sensitive parameters.
 * e.g., "AC101 C 090 C 12 S 250"
 * returns { ok, command, error }
 */
export function parseRawCommand(raw){
  if (!raw || typeof raw !== 'string') return { ok: false, error: 'Empty command' };
  const parts = raw.trim().toUpperCase().split(/\s+/);
  if (parts.length < 2) return { ok: false, error: 'Incomplete command. Expected: <callsign> <verb> [params]' };

  const callsign = parts[0];
  const commandParts = parts.slice(1);
  const commands = [];
  let i = 0;

  while (i < commandParts.length) {
    const verb = commandParts[i].toLowerCase();
    i++;

    switch (verb) {
      case 'c': // Generic Clearance
        if (i >= commandParts.length) return { ok: false, error: "Expected parameter for 'C'" };
        const paramC = commandParts[i];
        if (/^\d{3}$/.test(paramC)) { // Heading: 3 digits
          commands.push({ type: 'set_heading', params: { heading: parseFloat(paramC) } });
        } else if (/^\d{1,2}$/.test(paramC)) { // Altitude: 1-2 digits (x1000 ft)
          commands.push({ type: 'climb_to', params: { altitude: parseFloat(paramC) * 1000 } });
        } else {
          return { ok: false, error: `Invalid parameter for 'C': ${paramC}` };
        }
        i++;
        break;
      case 's': // Speed
        if (i >= commandParts.length) return { ok: false, error: "Expected parameter for 'S'" };
        commands.push({ type: 'set_speed', params: { speed: parseFloat(commandParts[i]) } });
        i++;
        break;
      case 'h': // Hold
        commands.push({ type: 'hold', params: {} });
        break;
      default:
        return { ok: false, error: `Unknown command verb: ${verb.toUpperCase()}` };
    }
  }
  return { ok: true, callsign, commands };
}

/**
 * validateCommand(command, sim)
 * basic checks: existence of target, feasibility
 */
export function validateCommand(command, sim){
  const ac = sim.getAircraftByCallsign(command.callsign);
  if (!ac) return { ok:false, reason:'unknown callsign' };
  // simple forbid extreme altitude for non-VGHS
  if ((command.type==='climb_to' || command.type==='descend_to') && ac.type !== 'hypersonic' ){
    if (command.params.altitude > 100000) return { ok:false, reason:'altitude too high' };
  }
  // speed checks
  if (command.type === 'set_speed' && command.params.speed > ac.profile.maxSpeed * 1.2) return { ok:false, reason:'speed exceeds limits' };
  return { ok:true };
}

/**
 * dispatchCommand(command, sim) - apply to target aircraft
 */
export function dispatchCommand(command, sim){
  const ac = sim.getAircraftByCallsign(command.callsign);
  if (!ac) return { accepted:false, reason:'not found' };
  // normalize relative headings if provided
  if (typeof command.params.heading === 'string' && command.params.heading.startsWith('relative_')) {
    const delta = parseFloat(command.params.heading.split('_')[1]);
    command.params.heading = (ac.heading + delta + 360) % 360;
  }
  const res = ac.applyCommand(command);
  sim.logMessage(`CMD_DISPATCH ${command.type} -> ${ac.callsign}`);
  return res;
}
