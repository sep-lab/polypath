#!/usr/bin/env bash
# DEPRECATED: Use Ansible playbook instead.
# See infra/ansible/ — this script will be removed after Ansible validation.
# oracle-retry-vm2.sh — Retry creating Oracle VM #2 until capacity is available
# Run via cron: */30 * * * * /path/to/oracle-retry-vm2.sh >> /tmp/oracle-retry.log 2>&1
set -euo pipefail

# OCIDs identify your Oracle Cloud tenancy and resources — a tenancy OCID
# uniquely identifies the account, so these come from the environment.
# Find them with: oci iam compartment list / oci compute image list
TENANCY="${OCI_TENANCY_OCID:?Set OCI_TENANCY_OCID}"
SUBNET_ID="${OCI_SUBNET_OCID:?Set OCI_SUBNET_OCID}"
IMAGE_ID="${OCI_IMAGE_OCID:?Set OCI_IMAGE_OCID}"
AD="${OCI_AVAILABILITY_DOMAIN:?Set OCI_AVAILABILITY_DOMAIN}"
SSH_KEY_FILE="$HOME/.ssh/id_ed25519.pub"
LOCK_FILE="/tmp/oracle-vm2-created.lock"

# Skip if already created
if [ -f "$LOCK_FILE" ]; then
  echo "[$(date)] VM2 already created (lock file exists). Skipping."
  exit 0
fi

echo "[$(date)] Attempting Oracle VM #2 creation..."

OUTPUT=$(oci compute instance launch \
  --compartment-id "$TENANCY" \
  --availability-domain "$AD" \
  --display-name "vpn-exit-2" \
  --image-id "$IMAGE_ID" \
  --shape "VM.Standard.A1.Flex" \
  --shape-config '{"ocpus": 1, "memoryInGBs": 1}' \
  --subnet-id "$SUBNET_ID" \
  --assign-public-ip true \
  --ssh-authorized-keys-file "$SSH_KEY_FILE" \
  --query "data.{Name:\"display-name\",ID:id,State:\"lifecycle-state\"}" \
  --output json 2>&1) || true

if echo "$OUTPUT" | grep -q "PROVISIONING\|RUNNING"; then
  echo "[$(date)] SUCCESS! VM #2 created!"
  echo "$OUTPUT"
  
  # Get the public IP
  INSTANCE_ID=$(echo "$OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ID'])")
  echo "Instance ID: $INSTANCE_ID"
  
  # Write lock file with instance details
  echo "$OUTPUT" > "$LOCK_FILE"
  echo "[$(date)] Lock file written. Remove $LOCK_FILE to retry."
  
  # Notify (optional — uncomment if you have a notification method)
  # curl -s "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Oracle VM2 created!"
  
elif echo "$OUTPUT" | grep -q "Out of host capacity"; then
  echo "[$(date)] Still no capacity. Will retry next run."
else
  echo "[$(date)] Unexpected error:"
  echo "$OUTPUT"
fi
