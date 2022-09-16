# Introduction
This tutorial explains a cost-effective and serverless approach for automating the process of applying machine type recommendations 
to specific GCE instances (using label).

It makes use of the following GCP services:
- Cloud Scheduler
- Pup/Sub
- Cloud Functions (2nd generation)
- Google Compute Engine (GCE)

# How to use it

Before you get started you : 
- You need a GCP project with billing enabled.
- You need to have a at least one VM (or more) in your project that has machine-type recommendation shown in the UI. 
- If not, you can create one or to small (oversized) VMs and let them run for a while until the machine-type recommendation(s) is visible in the UI.
- Label the VMs for which you want to apply the machine-type recommendation (e.g label: auto-size=true).


  
