#!/bin/bash
set -e

echo "=========================================="
echo "Arena AI — Kali Linux KVM Setup Script"
echo "=========================================="

ARENA_DIR="${ARENA_DIR:-$HOME/arena-vms}"
mkdir -p "$ARENA_DIR"
cd "$ARENA_DIR"

echo "1. Downloading Kali Linux QEMU Image (approx 3.5GB)..."
wget -c -O kali-qemu.7z "https://cdimage.kali.org/kali-2026.1/kali-linux-2026.1-qemu-amd64.7z"

echo "2. Extracting Kali image (this might take a minute)..."
# Extract and find the qcow2 file
7z x -y kali-qemu.7z > /dev/null
QCOW2_FILE=$(find . -name "*.qcow2" | head -n 1)

if [ -z "$QCOW2_FILE" ]; then
    echo "Error: Could not find extracted .qcow2 file"
    exit 1
fi

echo "Found disk image: $QCOW2_FILE"

# Move it to a permanent location
mv "$QCOW2_FILE" /var/lib/libvirt/images/kali-arena.qcow2
chown libvirt-qemu:libvirt-qemu /var/lib/libvirt/images/kali-arena.qcow2 2>/dev/null || true

echo "3. Creating Kali VM in KVM..."
# Check if a VM named 'kali' already exists
if virsh list --all | grep -qw "kali"; then
    echo "A VM named 'kali' already exists. Skipping creation."
else
    virt-install \
        --name kali \
        --memory 32768 \
        --vcpus 8 \
        --disk path=/var/lib/libvirt/images/kali-arena.qcow2,format=qcow2,bus=virtio \
        --import \
        --os-variant debian11 \
        --network default \
        --graphics spice \
        --noautoconsole

    echo "✅ Kali VM successfully created and started!"
fi

echo "=========================================="
echo "Setup Complete!"
echo "You can now open 'Virtual Machine Manager' to see your VMs."
echo "Login to Kali with username: kali / password: kali"
echo "=========================================="
