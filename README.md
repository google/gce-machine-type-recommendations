# Introduction
This tutorial explains a cost-effective and serverless approach for automating the process of applying machine type recommendations 
to specific GCE instances (using label).
```
By automatically applying machine type recommendations GCP customers can save money 
while also saving time of having to do this task manually for each GCE instance.
```

In this tutorial we will makes use of the following GCP services:
- Cloud Scheduler
- Pup/Sub
- Cloud Functions (2nd generation)
- Google Compute Engine (GCE)

# Pre-requisites
Before you get started you : 
- You need a GCP project with billing enabled.

# How to use this solution


1. Creating GCE instances if they don't already exist

- You need to have a at least one VM (or more) in your project that has machine-type recommendation shown in the UI. 

In this case choose the VMs for which you want to apply the machine-type recommendation automatically by labeling them (for example label:autosize=true). In the future, applying label can be enforced during the creation of the VM instances through Ifranstructurre-as-Code (IaC).

- I you don't already have VMs with machine-type recommendations, you can create one or more small (oversized) VMs and let them run "idle" for a while until the machine-type recommendation(s) is visible in the UI.

- In our case, we will create two VMs test-instance-1 and test-instance-2 in the GCP zone us-central1-a and we will add a label **auto-size=true** to the test-instance-1.

```
gcloud compute instances create test-instance-1 --zone=us-central1-a --machine-type=e2-medium --labels=autosize=true 
```

```
gcloud compute instances create test-instance-2 --zone=us-central1-a --machine-type=e2-medium  
```
  
  You will need to let these instances run **idle** for a while until the machine-type recommendations. 
  
  
  
  2) Create a Pub/Sub topic

Create a Pub/Sub topic (e.g gce-sizing-recommendations-topic) as follow:
```
gcloud pubsub topics create gce-sizing-recommendations-topic
```
  
  3). Create a Cloud Scheduler cron job 
  
  gcloud scheduler jobs create pubsub gce-recommendations-job \
    --location=us-central1 \
    --schedule="0 4 * * *" \
    --topic="gce-sizing-recommendations-topic" \
    --message-body=`{zone:"us-central1-a", label:"autosize=true"}`
  
As you can see, we have created cron job will run on a regular basis once per day day at 4:00am, and it has the following message body:
**{"zone":"us-central1-a", "label":"autosize=true"}**

  
