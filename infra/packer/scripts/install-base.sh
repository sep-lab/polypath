#!/usr/bin/env bash
# Non-Ansible bootstrap steps run before Ansible during Packer builds.
# For most setups, Ansible handles everything. This script handles
# cases where Python3 may not be pre-installed on the base image.
set -euo pipefail

echo "=== Base install script ==="
apt-get update -y
apt-get install -y python3 python3-pip
echo "=== Done ==="
