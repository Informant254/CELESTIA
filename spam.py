import pyautogui as pg
import time


msg = str(input("message: "))
x = int(input("how many times: "))

time.sleep(5)

for n in range(0, x):
    pg.write(msg)
    pg.press("enter")
    time.sleep(0.1)