import { Router } from 'express';
import db from '../db.js';
import { logActivity } from '../services/roundManager.js';

const router = Router();

router.post('/run-test', async (_req, res) => {
  const vms = db.queryAll('SELECT * FROM vms');

  const logToDb = (message, level = 'info', vmId = 'host', vmRole = 'host') => {
    logActivity({ roundId: 'health-check', vmId, vmRole, level, message });
  };

  logToDb('Starting system-wide health check...', 'info');

  const results = await Promise.all(vms.map(async (vm) => {
    if (!vm.ip) {
      logToDb(`VM ${vm.id} has no IP assigned. Skipping.`, 'error');
      return { id: vm.id, name: vm.name, status: 'fail', error: 'No IP assigned' };
    }

    try {
      logToDb(`Sending test command to ${vm.name} (${vm.ip})...`, 'info');
      const instruction = `ask openclaw to create a txt file on desktop and name it test${vm.ip}.txt containing the text "Health test successful for ${vm.ip}"`;

      const response = await fetch(`http://${vm.ip}:9030/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, roundId: 'health-check', vmId: vm.id }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        logToDb(`Command delivered to ${vm.name} successfully.`, 'success');
        return { id: vm.id, name: vm.name, status: 'success' };
      }
      logToDb(`VM ${vm.name} returned HTTP ${response.status}`, 'error');
      return { id: vm.id, name: vm.name, status: 'fail', error: `HTTP ${response.status}` };
    } catch (error) {
      logToDb(`Failed to reach VM ${vm.name}: ${error.message}`, 'error');
      return { id: vm.id, name: vm.name, status: 'fail', error: error.message };
    }
  }));

  logToDb('Health check completed.', 'info');
  res.json({ results });
});

export default router;
