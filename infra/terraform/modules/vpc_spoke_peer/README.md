# VPC Spoke Peer module

This module contains configuration for setting up a VPC Spoke Peer. This is used to centralize PrivateLink connections to a single VPC (A VPC Hub), to reduce costs. We are currently not using the VPC Hub, but in case it is deployed, this module will be used to create the VPC Spoke Peer connections.

The module configures Route53 Resolver rules to allow DNS resolution between the VPC Spoke and the VPC Hub through a VPC Peering Connection.
