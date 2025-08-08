apiVersion: 1

datasources:
  - name: CloudWatch
    type: cloudwatch
    access: proxy
    jsonData:
      authType: default
      defaultRegion: ${aws_region}
      assumeRoleArn: ""
    isDefault: false
    editable: false
