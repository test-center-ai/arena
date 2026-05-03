#!/bin/bash
echo "Cleaning up old data..."
rm -rf /home/hermes/Downloads/win11_vm
mkdir -p /home/hermes/Downloads/win11_vm
echo "Extracting (Safe Mode)..."
7z x /home/hermes/Downloads/win11_vm.zip -o/home/hermes/Downloads/win11_vm/ -y
echo "Locating disk image..."
VMDK=$(find /home/hermes/Downloads/win11_vm/ -name "*.vmdk" | head -n 1)
echo "Converting $VMDK to QCOW2..."
echo "DAHome18@" | sudo -S qemu-img convert -f vmdk -O qcow2 "$VMDK" /var/lib/libvirt/images/win11-arena.qcow2
echo "Cleaning up extraction files..."
rm -rf /home/hermes/Downloads/win11_vm
echo "Restarting VM..."
echo "DAHome18@" | sudo -S virsh destroy win11-arena || true
echo "DAHome18@" | sudo -S virsh start win11-arena
echo "SYSTEM READY!"
