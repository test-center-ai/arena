#!/bin/bash
echo "Extracting..."
mkdir -p /home/hermes/Downloads/win11_vm
7z x /home/hermes/Downloads/win11_vm.zip -o/home/hermes/Downloads/win11_vm/
echo "Locating disk image..."
VMDK=$(find /home/hermes/Downloads/win11_vm/ -name "*.vmdk" | head -n 1)
echo "Converting $VMDK to QCOW2..."
echo "DAHome18@" | sudo -S qemu-img convert -f vmdk -O qcow2 "$VMDK" /var/lib/libvirt/images/win11-arena.qcow2
echo "Cleaning up..."
rm -rf /home/hermes/Downloads/win11_vm
echo "DAHome18@" | sudo -S virsh start win11-arena
echo "DONE!"
