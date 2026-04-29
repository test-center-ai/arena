import db from './db.js';

async function fix() {
  try {
    db.run('UPDATE settings SET host_ip=?, net_interface=? WHERE id=1', ['1.1.2.164', 'virbr0']);
    db.run('UPDATE vms SET ip=?, virsh_name=? WHERE id="vm-a"', ['192.168.122.206', 'win11-arena']);
    db.run('UPDATE vms SET ip=?, virsh_name=? WHERE id="vm-b"', ['192.168.122.192', 'kali']);
    console.log('Database fix applied successfully');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

fix();
