#!/usr/bin/env bash
# Mounts an EBS volume with ID set by DATA_EBS_VOLUME_ID to /data
# https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-using-volumes.html

if [ -d /data ]
then
  echo "A volume is already mounted to /data";
  exit 0;
fi;

# Load environment variables
export "$(< /etc/environment xargs)";

# Find the name of the device matching the volume ID. The volume may not be available
# immediately, so we retry this several times
device=$(nvme list -o json | jq -r --arg id "$DATA_EBS_VOLUME_ID" '.Devices|.[] | select(.SerialNumber == $id) | .DevicePath');
while [ -z "$device" ]
do
  echo "Volume $DATA_EBS_VOLUME_ID not found. Sleeping for 10 seconds ...";
  sleep 10;
  device=$(nvme list -o json | jq -r --arg id "$DATA_EBS_VOLUME_ID" '.Devices|.[] | select(.SerialNumber == $id) | .DevicePath');
  tries=$(( tries + 1 ));
  if [ $tries -gt 10 ]
  then
    echo "Could not find device for volume $DATA_EBS_VOLUME_ID";
    exit 1;
  fi;
done;

echo "Device name = $device";

# Make the filesystem if there is not already one on the device
status=$(file -s "$device");
if [ "$status" == "$device: data" ]
then
  mkfs -t xfs "$device";
  echo "Created an XFS filesystem on device $device";
else
  echo "Filesystem already exists on device $device";
fi;

mkdir /data;
mount "$device" /data;
echo "Mounted device $device to /data";

# Reference the volume in /etc/fstab so it will be remounted when the instance reboots
device_uuid=$(blkid | grep "$device" | sed -E 's/.*UUID="([a-zA-Z0-9\-]+)".*$/\1/');
echo "Device UUID = $device_uuid";
echo "UUID=$device_uuid  /data  xfs  defaults,nofail  0  2" > /fstab;
