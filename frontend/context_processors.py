import time

def latest_timestamp(request):
    localtime = time.localtime()
    current_second = localtime.tm_sec
    current_minute = localtime.tm_min
    current_hour = localtime.tm_hour

    return{
        "latest": f"{current_second}{current_minute}{current_hour}"
    }