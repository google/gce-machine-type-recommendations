/*
Copyright 2022 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


const { google } = require('googleapis');
const compute = require('@google-cloud/compute');
const { RecommenderClient } = require('@google-cloud/recommender');
const instancesClient = new compute.InstancesClient({ fallback: 'rest' });

/**
 * Checks for machine type recommendations and applies them specific Compute Engine instances (VMs).
 *
 * Expects a PubSub message with JSON-formatted event data containing the
 * following attributes:
 *  zones - the GCP zones where the GCE instances eligible for auto-sizing are located.
 *  label - the label of instances for which appying sizing recommendations is allowed.
 *
 * @param {!object} event Cloud Function PubSub message event.
 * @param {!object} callback Cloud Function PubSub callback indicating completion.
 */


// [START functions_Apply-Sizing-Recommendations]

exports.applySizingRecommendationsFct = async (event, context, callback) => {

  try {

    // checks if the event's payload have the required attributes
    var payload = _validatePayload(event);

    // extracting the attributes zone and label (key and value) from the payload 
    var zone = payload.zone;
    const label = payload.label;

    // gets the current GCP project Id
    const projectId = await instancesClient.getProjectId();

    // setting the recommender type
    var recommenderId = 'google.compute.instance.MachineTypeRecommender';

    // getting the list of GCE instances in the GCP zone specified by 'zone' and that are labeled with 'label'
    const gceInstances = await getVMs(projectId, label, zone);

    // getting the list of "machine type"  recommendations available on a specific GCP 'zone' 
    const recommendations = await listRecommendations(projectId, recommenderId, zone);

    // if we have GCE instance that are labeled as eligible for auto-sizing, 
    // and if we have sizing recommendations available, then we need to apply them
    if (gceInstances.length > 0 && recommendations.length > 0) {

      var instanceNames = [];

      // prepare the list of GCE instances that can be auto-sized
      gceInstances.forEach(instance => {

        instanceNames.push(instance.name);

      });

      // loop through the sizing recommendations and apply them to the corresponding GCE instances
      for (const recommendation of recommendations) {

        // reading insight(s) from the machine-type recommendation object
        var insight = recommendation.content.operationGroups[0];
        var currentResource = insight.operations[0].resource;
        var recommendedResource = insight.operations[1].value.stringValue;

        var instanceName = currentResource.substring(currentResource.lastIndexOf("/") + 1, currentResource.length);

        // check if the GCE instance is eligible for auto-sizing
        if (instanceNames.includes(instanceName)) {

          var pattern = insight.operations[0].valueMatcher.matchesPattern; // Example of pattern format ".*zones/us-central1-a/machineTypes/e2-medium"

          // reading the recommended machine type
          var current_machine_type = pattern.substring(pattern.lastIndexOf("/") + 1, pattern.length).trim();
          var recommended_machine_type = recommendedResource.substring(recommendedResource.lastIndexOf("/") + 1, recommendedResource.length).trim();

          // stopping the GCE instance: the VM needs to be in the "TREMINATED" state before changing the machine type.
          console.log("Stopping the GCE instance " + instanceName);
          await stopInstance(projectId, zone, instanceName);

          // applying the sizing recommendation by changing the machine type to the recommended one.
          console.log("Trying to apply sizing recommendation for instance " + instanceName + 
                      " by chaning machine type from " + current_machine_type + 
                      " to " + recommended_machine_type);

          await applySizing(projectId, zone, instanceName, recommendedResource);

          // restarting the instance
          console.log("Restarting the GCE instance " + instanceName);
          await startInstance(projectId, zone, instanceName);

        }

      }

      const message = "Recommendations applied successfully";
      console.log(message);
      callback(null, message);

    } else {

      const message = "Nothing to do here: either there is no machine type recommendations,"+"\n"+
                      "or there is no GCE instances eligible for auto-sizing in the specified zone (" + zone + ")";
      console.log(message);
      callback(null, message);
    }

    const message = "Operation successfully completed.";
    console.log(message);
    callback(null, message);

  } catch (err) {
    console.log(err);
    callback(err);
  }
};

/**
 * Returns all VMs that have a specific label, and that are deployed in a specific GCP zone.
 */
async function getVMs(projectId, label, zone) {

  try {
    const project = projectId.toString();
    const options = {
      filter: "labels." + label, //`labels.${payload.label}`,  
      project,
      zone: zone,
    };

    const [instances] = await instancesClient.list(options);

    return instances;

  } catch (err) {
    console.log(err);
    throw new Error('Error while trying to get the list of GCE instances: ' + err);
  }
}

/**
 * Returns the machine type recommendations' list for all VMs in a specific GCP zone.
 */
async function listRecommendations(projectId, recommenderId, zone) {

  //const { RecommenderClient } = require('@google-cloud/recommender');  // <==== check if we can remove this to a global scope
  const recommender = new RecommenderClient();

  try {
    const [recommendations] = await recommender.listRecommendations({
      parent: recommender.projectLocationRecommenderPath(
        projectId,
        zone,
        recommenderId
      ),
    });
    return recommendations;

  } catch (err) {
    console.log(err);
    throw new Error('Error while trying to get the list of GCE sizing recommendations: ' + err);
  }

}

/**
 * Applies machine type recommendation for a specific GCE instance
 */
async function applySizing(projectId, zone, instanceName, newInstanceType) {

  //const { google } = require('googleapis');
  var compute = google.compute('v1');

  

  //Get prepared for applying recommendations 
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  var authClient = await auth.getClient();

  var request = {
    project: projectId,
    zone: zone,
    instance: instanceName,
    resource: {
      "machineType": newInstanceType
    },
    auth: authClient,
  };


  // apply the new machine type
  compute.instances.setMachineType(request, function (err, response) {
    if (err) {
      console.error(err);
      throw new Error('Error setting machine type: ' + err);
    }

    // TODO: Change code below to process the `response` object:
    console.log("Done applying new machine type for instance " + instanceName);
    console.log(JSON.stringify(response, null, 2));
  });

};

/**
 * Stops a given GCE instance (VM).
 */
async function stopInstance(projectId, zone, instanceName) {
  const instancesClient = new compute.InstancesClient();

  const [response] = await instancesClient.stop({
    project: projectId,
    zone,
    instance: instanceName,
  });
  let operation = response.latestResponse;
  const operationsClient = new compute.ZoneOperationsClient();

  // Wait for the operation to complete.
  while (operation.status !== 'DONE') {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: projectId,
      zone: operation.zone.split('/').pop(),
    });
  }

  console.log('Instance ' + instanceName + ' is stopped.');
  return;
}

/**
 * Starts a given GCE instance (VM).
 */

async function startInstance(projectId, zone, instanceName) {
  const instancesClient = new compute.InstancesClient();

  const [response] = await instancesClient.start({
    project: projectId,
    zone,
    instance: instanceName,
  });


  let operation = response.latestResponse;
  const operationsClient = new compute.ZoneOperationsClient();


  // Wait for the operation to complete.
  while (operation.status !== 'DONE') {
    [operation] = await operationsClient.wait({
      operation: operation.name,
      project: projectId,
      zone: operation.zone.split('/').pop(),
    });
  }

  console.log('Instance ' + instanceName + ' is started.');
  return;
}


/**
 * Validates that a request payload contains the expected fields.
 *
 * @param {!object} payload the request payload to validate.
 * @return {!object} the payload object.
 */
const _validatePayload = event => {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(event.data, 'base64').toString());
  } catch (err) {
    throw new Error('Invalid Pub/Sub message: ' + err);
  }
  if (!payload.label) {
    throw new Error("Attribute 'label' missing from payload");
  }

  if (!payload.zone) {
    throw new Error("Attribute 'zone' missing from payload");
  }
  return payload;
};