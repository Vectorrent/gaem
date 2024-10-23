#!/bin/sh

# Render objects
node render-object.js x=30 y=60 z=90 saveName=angle1
node render-object.js x=90 y=30 z=60 saveName=angle2
node render-object.js x=0 y=20 z=180 saveName=angle3
node render-object.js x=30 y=60 saveName=angle4
node render-object.js x=30 saveName=angle5
node render-object.js saveName=angle6

# Reconstruct objects
node reconstruct-object.js sourceData=angle1.json saveName=angle1
node reconstruct-object.js sourceData=angle2.json saveName=angle2
node reconstruct-object.js sourceData=angle3.json saveName=angle3
node reconstruct-object.js sourceData=angle4.json saveName=angle4
node reconstruct-object.js sourceData=angle5.json saveName=angle5
node reconstruct-object.js sourceData=angle6.json saveName=angle6