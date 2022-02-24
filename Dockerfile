FROM ubuntu:20.04
RUN apt-get update && apt-get -y install binutils

COPY flights-x86_64-unknown-linux-gnu /flights
COPY flights.db /
COPY index.html /

RUN mkdir -p /rootfs
RUN ldd /flights \
    /lib/x86_64-linux-gnu/libnss_files.so.* \
    /lib/x86_64-linux-gnu/libnss_dns.so.* \
    | grep -o -e '\/\(usr\|lib\)[^ :]\+' \
    | sort -u | tee /rootfs.list

RUN cat /rootfs.list | grep -v '/flights' | xargs strip
RUN echo /flights >> /rootfs.list
RUN echo /flights.db >> /rootfs.list
RUN echo /index.html >> /rootfs.list
RUN echo 'hosts: files dns' > /etc/nsswitch.conf
RUN echo /etc/nsswitch.conf >> /rootfs.list
RUN cat /rootfs.list | tar -T- -cphf- | tar -C /rootfs -xpf-

FROM scratch
COPY --from=0 /rootfs/ /
EXPOSE 7999
ENV HOST="0.0.0.0"
CMD ["/flights"]
